#!/usr/bin/env perl
# Subagent scheduler: admits each bench run or omp subagent into a machine-wide slot, shared fairly between owners,
# then runs the command and holds the slot until it exits; children it leaves running do not keep the slot.
# The cap adapts: a control loop (started on demand, exits when nothing runs or waits) raises it while CPU,
# memory and responsiveness have room and cuts it on swapping, memory pressure or lag.
# usage: subagent-scheduler.pl <command> [args...]     subagent-scheduler.pl --control
# env: SUBAGENT_SCHEDULER_SLOTS (fixed cap, disables the control loop), SUBAGENT_SCHEDULER_OWNER
#      (fair-share key, default: worktree name), SUBAGENT_SCHEDULER_DIR
use strict;
use warnings;
use Cwd qw(abs_path);
use Errno qw(ESRCH);
use Fcntl qw(:flock);
use File::Path qw(make_path);
use File::Basename qw(basename dirname);
use POSIX qw(setsid strftime sigprocmask SIG_BLOCK SIG_UNBLOCK SIGINT SIGTERM SIGHUP);
use Time::HiRes qw(sleep time);

# 12 keeps CPU idle >= 24% and shell latency at baseline with code-rule Haiku cells; the control loop starts here.
use constant DEFAULT_SLOTS => 12;
use constant MIN_SLOTS => 1;
use constant MAX_SLOTS => 32;
use constant POLL_SECONDS => 0.5;
use constant START_SPACING_SECONDS => 0.5;

use constant TICK_SECONDS => 2;
use constant CAP_STALE_SECONDS => 15;
use constant IDLE_EXIT_SECONDS => 120;
use constant GROW_INTERVAL_SECONDS => 10;
use constant BACKOFF_INTERVAL_SECONDS => 10;
use constant BACKOFF_FRACTION => 0.25;
use constant CPU_IDLE_GROW_PCT => 25;
use constant CPU_IDLE_FLOOR_PCT => 10;
use constant SATURATED_TICKS => 2;
use constant AVAILABLE_MEMORY_FLOOR => 0.15;
use constant SWAPOUT_PAGES_LIMIT => 256;
use constant PRESSURE_WARN_LEVEL => 2;
use constant PROBE_LIMIT_MS => 40;
use constant PROBE_RUNS => 3;

my $dir = $ENV{SUBAGENT_SCHEDULER_DIR} // "$ENV{HOME}/.cache/subagent-scheduler";
my $fixed_cap = $ENV{SUBAGENT_SCHEDULER_SLOTS};
my $owner;

main() unless caller;

sub main {
    die "usage: subagent-scheduler.pl <command> [args...]\n" unless @ARGV;
    die "subagent-scheduler: SUBAGENT_SCHEDULER_SLOTS must be @{[MIN_SLOTS]}..@{[MAX_SLOTS]}\n"
        if defined $fixed_cap && !valid_cap($fixed_cap);
    make_path("$dir/wait");
    die "subagent-scheduler: cannot create $dir/wait\n" unless -d "$dir/wait";
    return control_loop() if $ARGV[0] eq '--control';
    $owner = $ENV{SUBAGENT_SCHEDULER_OWNER} // basename(dirname(dirname(abs_path($0))));
    $owner =~ s/[^\w.-]/_/g;
    run_in_slot();
}

sub run_in_slot {
    my $waiter = "$dir/wait/$owner.$$";
    write_file($waiter, '');
    for my $signal (qw(INT TERM HUP)) {
        $SIG{$signal} = sub { unlink $waiter; $SIG{$signal} = 'DEFAULT'; kill $signal => $$ };
    }
    my ($slot, $slot_fh);
    until (($slot, $slot_fh) = try_admit()) {
        sleep POLL_SECONDS + rand(POLL_SECONDS);
    }
    unlink $waiter;
    $ENV{SUBAGENT_SCHEDULER_SLOT} = $slot;
    exit run_command();
}

# The slot lock stays in this process (Perl opens it close-on-exec), so it frees when the command exits
# even if the command leaves background children running.
sub run_command {
    my $pid;
    my $forwarded = POSIX::SigSet->new(SIGINT, SIGTERM, SIGHUP);
    # Blocked until $pid is set: a signal arriving earlier would find no command to forward to and be lost.
    sigprocmask(SIG_BLOCK, $forwarded);
    $SIG{$_} = sub { kill $_[0] => $pid } for qw(INT TERM HUP);
    $pid = fork // die "subagent-scheduler: fork: $!\n";
    unless ($pid) {
        $SIG{$_} = 'DEFAULT' for qw(INT TERM HUP);
        sigprocmask(SIG_UNBLOCK, $forwarded);
        exec { $ARGV[0] } @ARGV or die "subagent-scheduler: exec $ARGV[0]: $!\n";
    }
    sigprocmask(SIG_UNBLOCK, $forwarded);
    1 until waitpid($pid, 0) == $pid;
    return $? & 127 ? 128 + ($? & 127) : $? >> 8;
}

sub try_admit {
    my $gate = admit_gate();
    my $last = (Time::HiRes::stat("$dir/last-start"))[9] // 0;
    return if time - $last < START_SPACING_SECONDS;
    my $cap = current_cap();
    my ($free, $held) = scan_slots();
    return if held_total($held) >= $cap || !defined $free || !my_turn($owner, $held, $cap, live_waiters());
    open my $fh, '>>', "$dir/slot.$free" or die "subagent-scheduler: slot.$free: $!\n";
    flock($fh, LOCK_EX | LOCK_NB) or return;
    write_file("$dir/slot.$free.owner", $owner);
    write_file("$dir/last-start", '');
    return ($free, $fh);
}

sub current_cap {
    return $fixed_cap if defined $fixed_cap;
    my $age = time - ((stat "$dir/cap")[9] // 0);
    my $cap = read_file("$dir/cap");
    my $valid = defined $cap && valid_cap($cap);
    return $cap if $age < CAP_STALE_SECONDS && $valid;
    start_control_loop();
    # A stale cap is the loop's last choice; the default would undo its cuts until the loop catches up.
    return $valid ? $cap : DEFAULT_SLOTS;
}

sub start_control_loop {
    open my $lock, '>>', "$dir/control.lock" or die "subagent-scheduler: control.lock: $!\n";
    return unless flock($lock, LOCK_EX | LOCK_NB);
    close $lock;
    my $pid = fork // die "subagent-scheduler: fork: $!\n";
    return if $pid;
    setsid();
    open STDIN, '<', '/dev/null';
    open STDOUT, '>', '/dev/null';
    open STDERR, '>>', "$dir/control.log";
    exec $^X, abs_path($0), '--control' or die "subagent-scheduler: exec control loop: $!\n";
}

sub admit_gate {
    open my $gate, '>>', "$dir/admit.lock" or die "subagent-scheduler: admit.lock: $!\n";
    flock($gate, LOCK_EX) or die "subagent-scheduler: flock: $!\n";
    return $gate;
}

sub scan_slots {
    my ($free, %held);
    for my $index (0 .. MAX_SLOTS - 1) {
        open my $fh, '>>', "$dir/slot.$index" or die "subagent-scheduler: slot.$index: $!\n";
        if (flock($fh, LOCK_EX | LOCK_NB)) {
            $free //= $index;
            next;
        }
        my $holder = read_file("$dir/slot.$index.owner") // 'unknown';
        $held{$holder}++;
    }
    return ($free, \%held);
}

sub held_total {
    my ($held) = @_;
    my $total = 0;
    $total += $_ for values %$held;
    return $total;
}

sub my_turn {
    my ($me, $held, $cap, @waiting) = @_;
    my %waiting = map { $_ => 1 } @waiting;
    my %active = (%waiting, $me => 1, map { $_ => 1 } keys %$held);
    my $owners = keys %active;
    my $share = int(($cap + $owners - 1) / $owners);
    return 1 if ($held->{$me} // 0) < $share;
    my @starved = grep { $_ ne $me && ($held->{$_} // 0) < $share } keys %waiting;
    return !@starved;
}

sub live_waiters {
    my @owners;
    for my $path (glob "$dir/wait/*") {
        my ($name, $pid) = basename($path) =~ /^(.+)\.(\d+)$/ or next;
        if (!kill(0, $pid) && $! == ESRCH) {
            unlink $path;
            next;
        }
        push @owners, $name;
    }
    return @owners;
}

sub control_loop {
    open my $lock, '>>', "$dir/control.lock" or die "subagent-scheduler: control.lock: $!\n";
    flock($lock, LOCK_EX | LOCK_NB) or return;
    my $cap = read_file("$dir/cap");
    my %state = (cap => defined $cap && valid_cap($cap) ? $cap : DEFAULT_SLOTS, changed => 0, saturated => 0);
    my $last_busy = time;
    my $swapouts = (sample_memory())[1];
    while (time - $last_busy < IDLE_EXIT_SECONDS) {
        my $tick_start = time;
        my %load = scheduler_load();
        $last_busy = $tick_start if $load{held} || $load{waiting};
        my %machine = sample_machine(\$swapouts);
        my $reason = next_cap(\%state, \%machine, \%load, $tick_start);
        log_change(\%state, \%machine, \%load, $reason) if $reason;
        write_file("$dir/cap.tmp", $state{cap});
        rename "$dir/cap.tmp", "$dir/cap";
        my $elapsed = time - $tick_start;
        sleep TICK_SECONDS - $elapsed if $elapsed < TICK_SECONDS;
    }
    unlink "$dir/cap";
}

sub scheduler_load {
    my $gate = admit_gate();
    my (undef, $held) = scan_slots();
    return (held => held_total($held), waiting => scalar live_waiters());
}

# Returns a reason when it changes $state->{cap}; pure so it can be tested without a machine.
sub next_cap {
    my ($state, $machine, $load, $now) = @_;
    $state->{saturated} = $machine->{cpu_idle_pct} < CPU_IDLE_FLOOR_PCT ? $state->{saturated} + 1 : 0;
    my @strain = strain_reasons($machine);
    push @strain, 'cpu saturated' if $state->{saturated} >= SATURATED_TICKS;
    return shrink($state, $load, $now, @strain) if @strain;
    return if !$load->{waiting} || $load->{held} < $state->{cap} || $state->{cap} >= MAX_SLOTS;
    return if $now - $state->{changed} < GROW_INTERVAL_SECONDS;
    return if $machine->{cpu_idle_pct} < CPU_IDLE_GROW_PCT || $machine->{available_fraction} < AVAILABLE_MEMORY_FLOOR;
    @$state{qw(cap changed)} = ($state->{cap} + 1, $now);
    return 'grow: runs waiting, machine has room';
}

sub shrink {
    my ($state, $load, $now, @strain) = @_;
    return if $now - $state->{changed} < BACKOFF_INTERVAL_SECONDS;
    # Runs above the cap are a cut still draining; cutting again before they finish overshoots.
    return if $load->{held} > $state->{cap};
    my $running = $load->{held};
    my $cut = int($running * BACKOFF_FRACTION) || 1;
    my $cap = $running - $cut > MIN_SLOTS ? $running - $cut : MIN_SLOTS;
    return if $cap >= $state->{cap};
    @$state{qw(cap changed)} = ($cap, $now);
    return 'shrink: ' . join(', ', @strain);
}

sub strain_reasons {
    my ($machine) = @_;
    my @reasons;
    push @reasons, 'swapping' if $machine->{swapout_pages} > SWAPOUT_PAGES_LIMIT;
    push @reasons, 'memory pressure' if $machine->{pressure_level} >= PRESSURE_WARN_LEVEL;
    push @reasons, 'slow to respond' if $machine->{probe_ms} > PROBE_LIMIT_MS;
    return @reasons;
}

sub sample_machine {
    my ($swapouts_ref) = @_;
    my @iostat = `iostat -n0 -c 2 -w 1`;
    my ($cpu_idle) = $iostat[-1] =~ /^\s*\d+\s+\d+\s+(\d+)/;
    my ($available_fraction, $swapouts) = sample_memory();
    my $swapout_pages = $swapouts - $$swapouts_ref;
    $$swapouts_ref = $swapouts;
    return (
        # An unparsed sample sits at the floor: it neither counts as saturated nor allows growth.
        cpu_idle_pct => $cpu_idle // CPU_IDLE_FLOOR_PCT,
        available_fraction => $available_fraction,
        swapout_pages => $swapout_pages,
        pressure_level => 0 + `sysctl -n kern.memorystatus_vm_pressure_level`,
        probe_ms => probe_ms(),
    );
}

sub sample_memory {
    my $vm_stat = `vm_stat`;
    my ($page_bytes) = $vm_stat =~ /page size of (\d+) bytes/;
    my %pages = $vm_stat =~ /^(Pages free|Pages inactive|Pages speculative|Pages purgeable|Swapouts):\s+(\d+)/mg;
    my $available = 0;
    $available += $pages{$_} // 0 for ('Pages free', 'Pages inactive', 'Pages speculative', 'Pages purgeable');
    my $total_bytes = `sysctl -n hw.memsize`;
    return ($available * $page_bytes / $total_bytes, $pages{Swapouts} // 0);
}

# Median time to fork and exec a no-op: what a shell prompt waits on when the machine is stuck.
sub probe_ms {
    my @times;
    for (1 .. PROBE_RUNS) {
        my $start = time;
        system '/usr/bin/true';
        push @times, (time - $start) * 1000;
    }
    @times = sort { $a <=> $b } @times;
    return $times[int(PROBE_RUNS / 2)];
}

sub log_change {
    my ($state, $machine, $load, $reason) = @_;
    my $signals = join ' ', map { "$_=" . sprintf('%.3g', $machine->{$_}) } sort keys %$machine;
    my $stamp = strftime('%Y-%m-%dT%H:%M:%S', localtime);
    print STDERR "$stamp cap=$state->{cap} held=$load->{held} waiting=$load->{waiting} $reason | $signals\n";
}

sub valid_cap {
    my ($cap) = @_;
    return $cap =~ /^\d+$/ && $cap >= MIN_SLOTS && $cap <= MAX_SLOTS;
}

sub read_file {
    open my $fh, '<', $_[0] or return;
    my $text = <$fh>;
    return $text;
}

sub write_file {
    open my $fh, '>', $_[0] or die "subagent-scheduler: $_[0]: $!\n";
    print $fh $_[1];
    close $fh;
}
