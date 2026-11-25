#!/usr/bin/env perl
# Machine-wide slot pool for bench runs: waits for a free slot, shared fairly between worktrees,
# then execs the command while holding the slot until the command and its children exit.
# usage: pool.pl <command> [args...]
# env: BENCH_POOL_SLOTS (cap), BENCH_POOL_OWNER (fair-share key, default: worktree name), BENCH_POOL_DIR
use strict;
use warnings;
use Cwd qw(abs_path);
use Errno qw(ESRCH);
use Fcntl qw(:flock F_GETFD F_SETFD FD_CLOEXEC);
use File::Basename qw(basename dirname);
use Time::HiRes qw(sleep time);

# 12 keeps CPU idle >= 24% and shell latency at baseline with code-rule Haiku cells; 16+ pins the CPU.
use constant DEFAULT_SLOTS => 12;
use constant MAX_SLOTS => 32;
use constant POLL_SECONDS => 0.5;
use constant START_SPACING_SECONDS => 0.5;

die "usage: pool.pl <command> [args...]\n" unless @ARGV;
my $dir = $ENV{BENCH_POOL_DIR} // "$ENV{HOME}/.cache/bench-pool";
my $cap = $ENV{BENCH_POOL_SLOTS} // DEFAULT_SLOTS;
die "pool.pl: BENCH_POOL_SLOTS must be 1..@{[MAX_SLOTS]}\n" unless $cap =~ /^\d+$/ && $cap >= 1 && $cap <= MAX_SLOTS;
my $owner = $ENV{BENCH_POOL_OWNER} // basename(dirname(dirname(abs_path($0))));
$owner =~ s/[^\w.-]/_/g;
mkdir $dir;
mkdir "$dir/wait";

my $waiter = "$dir/wait/$owner.$$";
open my $mark, '>', $waiter or die "pool.pl: $waiter: $!\n";
close $mark;
for my $signal (qw(INT TERM HUP)) {
    $SIG{$signal} = sub { unlink $waiter; $SIG{$signal} = 'DEFAULT'; kill $signal => $$ };
}

my ($slot, $slot_fh);
until (($slot, $slot_fh) = try_admit()) {
    sleep POLL_SECONDS + rand(POLL_SECONDS);
}
unlink $waiter;
$ENV{BENCH_POOL_SLOT} = $slot;
# Perl opens files close-on-exec; the slot lock must survive exec to stay held by the command.
fcntl($slot_fh, F_SETFD, fcntl($slot_fh, F_GETFD, 0) & ~FD_CLOEXEC) or die "pool.pl: fcntl: $!\n";
exec { $ARGV[0] } @ARGV or die "pool.pl: exec $ARGV[0]: $!\n";

sub try_admit {
    open my $gate, '>>', "$dir/admit.lock" or die "pool.pl: admit.lock: $!\n";
    flock($gate, LOCK_EX) or die "pool.pl: flock: $!\n";
    my $last = (Time::HiRes::stat("$dir/last-start"))[9] // 0;
    return if time - $last < START_SPACING_SECONDS;
    my ($free, $held) = scan_slots();
    my $total = 0;
    $total += $_ for values %$held;
    return if $total >= $cap || !defined $free || !my_turn($held);
    open my $fh, '>>', "$dir/slot.$free" or die "pool.pl: slot.$free: $!\n";
    flock($fh, LOCK_EX | LOCK_NB) or return;
    write_file("$dir/slot.$free.owner", $owner);
    write_file("$dir/last-start", '');
    return ($free, $fh);
}

sub scan_slots {
    my ($free, %held);
    for my $index (0 .. MAX_SLOTS - 1) {
        open my $fh, '>>', "$dir/slot.$index" or die "pool.pl: slot.$index: $!\n";
        if (flock($fh, LOCK_EX | LOCK_NB)) {
            $free //= $index;
            next;
        }
        my $holder = read_file("$dir/slot.$index.owner") // 'unknown';
        $held{$holder}++;
    }
    return ($free, \%held);
}

sub my_turn {
    my ($held) = @_;
    my %waiting = map { $_ => 1 } live_waiters();
    my %active = (%waiting, $owner => 1, map { $_ => 1 } keys %$held);
    my $owners = keys %active;
    my $share = int(($cap + $owners - 1) / $owners);
    return 1 if ($held->{$owner} // 0) < $share;
    my @starved = grep { $_ ne $owner && ($held->{$_} // 0) < $share } keys %waiting;
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

sub read_file {
    open my $fh, '<', $_[0] or return;
    my $text = <$fh>;
    return $text;
}

sub write_file {
    open my $fh, '>', $_[0] or die "pool.pl: $_[0]: $!\n";
    print $fh $_[1];
    close $fh;
}
