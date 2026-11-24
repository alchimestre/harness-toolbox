package runner

import (
	"context"
	"errors"
	"sync"
	"time"

	"example.com/goworker/src/job"
	"example.com/goworker/src/queue"
	"example.com/goworker/src/resultlog"
)

// Handler performs one attempt of a job and must return once ctx is done.
type Handler func(ctx context.Context, j job.Job) error

// Options tunes the worker pool.
type Options struct {
	Workers     int
	MaxAttempts int
	JobTimeout  time.Duration
	BackoffMS   int
}

// Runner leases jobs from a queue, runs them and records every attempt.
type Runner struct {
	opts   Options
	queue  *queue.Queue
	log    *resultlog.Log
	handle Handler
	mu     sync.Mutex
	stats  Stats
	failed map[string]bool
}

// New returns a runner that uses handle for every attempt.
func New(opts Options, q *queue.Queue, log *resultlog.Log, handle Handler) *Runner {
	return &Runner{opts: opts, queue: q, log: log, handle: handle, failed: make(map[string]bool)}
}

// Run starts the workers, waits until the queue is empty and flushes the result log.
func (r *Runner) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	for range r.opts.Workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.work(ctx)
		}()
	}
	wg.Wait()
	return r.log.Flush()
}

func (r *Runner) work(ctx context.Context) {
	for {
		j, err := r.queue.Lease()
		if errors.Is(err, queue.ErrEmpty) {
			return
		}
		r.runOne(ctx, j)
	}
}

func (r *Runner) runOne(ctx context.Context, j job.Job) {
	attempt := j.Attempts + 1
	start := time.Now()
	err := r.attempt(ctx, j)
	rec := resultlog.Record{JobID: j.ID, Attempt: attempt, OK: err == nil, Duration: time.Since(start)}
	if err != nil {
		rec.Error = err.Error()
	}
	r.mu.Lock()
	r.stats.count(err == nil)
	r.mu.Unlock()
	r.log.Add(rec)
	if err == nil {
		r.queue.Ack(j.ID)
		return
	}
	if attempt <= r.opts.MaxAttempts {
		time.Sleep(r.backoff(attempt))
		r.queue.Nack(j.ID)
		return
	}
	r.queue.Ack(j.ID)
	r.markFailed(j.ID)
}
