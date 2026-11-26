#!/usr/bin/env perl
# Policy checks for src/subagent-scheduler.pl, no machine needed except the slot test. Run: perl test/subagent-scheduler.t
use strict;
use warnings;
use Cwd qw(abs_path);
use File::Basename qw(dirname);
use File::Temp qw(tempdir);
use Test::More;

my $scheduler = abs_path(dirname(__FILE__) . '/../src/subagent-scheduler.pl');
require $scheduler;

use constant NOW => 1000;
use constant SIGTERM_NUMBER => 15;
use constant WAIT_TRIES => 50;
use constant WAIT_STEP_SECONDS => 0.1;
use constant LONG_AGO => 0;
use constant ROOMY => { cpu_idle_pct => 50, available_fraction => 0.5, swapout_pages => 0, pressure_level => 1, probe_ms => 5 };
use constant PRESSURED => { %{+ROOMY}, pressure_level => 2 };
use constant SATURATED => { %{+ROOMY}, cpu_idle_pct => 5 };

sub state_at { return { cap => $_[0], changed => LONG_AGO, saturated => 0 } }

# next_cap: growth
{
    my $state = state_at(12);
    like(next_cap($state, ROOMY, { held => 12, waiting => 3 }, NOW), qr/^grow/, 'grows when full, runs wait, machine has room');
    is($state->{cap}, 13, 'grows by one');
    ok(!next_cap(state_at(12), ROOMY, { held => 8, waiting => 3 }, NOW), 'no growth while slots are free');
    ok(!next_cap(state_at(12), ROOMY, { held => 12, waiting => 0 }, NOW), 'no growth with nothing waiting');
    my $recent = { %{ state_at(12) }, changed => NOW - 1 };
    ok(!next_cap($recent, ROOMY, { held => 12, waiting => 3 }, NOW), 'no growth right after a change');
}

# next_cap: backoff
{
    my $state = state_at(13);
    like(next_cap($state, PRESSURED, { held => 13, waiting => 0 }, NOW), qr/memory pressure/, 'cuts on memory pressure');
    is($state->{cap}, 10, 'cuts a quarter of what runs');
    my $later = NOW + BACKOFF_INTERVAL_SECONDS();
    ok(!next_cap($state, PRESSURED, { held => 13, waiting => 0 }, $later), 'no second cut while the first still drains');
    is($state->{cap}, 10, 'cap holds while runs above it finish');
    like(next_cap($state, PRESSURED, { held => 10, waiting => 0 }, $later), qr/shrink/, 'cuts again once drained');
    is($state->{cap}, 8, 'second cut starts from what runs');
}

# next_cap: CPU saturation needs consecutive samples
{
    my $state = state_at(12);
    ok(!next_cap($state, SATURATED, { held => 12, waiting => 0 }, NOW), 'one saturated sample is not enough');
    like(next_cap($state, SATURATED, { held => 12, waiting => 0 }, NOW), qr/cpu saturated/, 'two saturated samples cut');
}

# my_turn: fair share between owners
{
    ok(my_turn('a', { b => 6 }, 12, 'a'), 'an owner under its share gets a turn');
    ok(!my_turn('a', { a => 6, b => 2 }, 12, 'a', 'b'), 'an owner at its share yields to a starved waiter');
    ok(my_turn('a', { a => 6, b => 6 }, 12, 'a', 'b'), 'an owner at its share runs when nobody else is starved');
    ok(my_turn('a', { a => 11 }, 12, 'a'), 'a sole owner may use the whole cap');
}

# Slot release: background children of the command must not keep the slot.
{
    local $ENV{SUBAGENT_SCHEDULER_DIR} = tempdir(CLEANUP => 1);
    local $ENV{SUBAGENT_SCHEDULER_SLOTS} = 1;
    local $ENV{SUBAGENT_SCHEDULER_OWNER} = 'test';
    my $status = system('perl', $scheduler, 'sh', '-c', '(sleep 5 &); exit 3');
    is($status >> 8, 3, 'exit status of the command passes through');
    my $start = time;
    system('perl', $scheduler, 'true');
    cmp_ok(time - $start, '<', 3, 'the slot frees when the command exits, not when its children do');

    my $held = "$ENV{SUBAGENT_SCHEDULER_DIR}/held";
    my $holder = spawn('perl', $scheduler, 'sh', '-c', "touch '$held'; exec sleep 30");
    wait_for(sub { -e $held });
    my $marker = "$ENV{SUBAGENT_SCHEDULER_DIR}/ran";
    my $queued = spawn('perl', $scheduler, 'touch', $marker);
    wait_for(sub { () = glob "$ENV{SUBAGENT_SCHEDULER_DIR}/wait/*" });
    kill TERM => $queued;
    waitpid $queued, 0;
    ok(!-e $marker, 'a run cancelled while queued never starts');
    ok(!glob("$ENV{SUBAGENT_SCHEDULER_DIR}/wait/*"), 'a run cancelled while queued leaves the queue');

    kill TERM => $holder;
    waitpid $holder, 0;
    is($? >> 8, 128 + SIGTERM_NUMBER, 'TERM reaches the running command');
    $start = time;
    system('perl', $scheduler, 'true');
    cmp_ok(time - $start, '<', 3, 'a cancelled run frees its slot');
}

sub spawn {
    my $pid = fork // die "fork: $!\n";
    exec @_ or die "exec $_[0]: $!\n" unless $pid;
    return $pid;
}

sub wait_for {
    my ($ready) = @_;
    for (1 .. WAIT_TRIES) {
        return if $ready->();
        select undef, undef, undef, WAIT_STEP_SECONDS;
    }
    die "condition never held\n";
}

done_testing();
