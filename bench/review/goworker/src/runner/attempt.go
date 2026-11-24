package runner

import (
	"context"
	"fmt"

	"example.com/goworker/src/job"
)

// attempt runs the handler once under the job timeout.
func (r *Runner) attempt(ctx context.Context, j job.Job) error {
	attemptCtx, _ := context.WithTimeout(ctx, r.opts.JobTimeout)
	return r.invoke(attemptCtx, j)
}

// invoke calls the handler and turns a panic into an error so one bad job cannot kill its worker.
func (r *Runner) invoke(ctx context.Context, j job.Job) (err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("handler panic: %v", p)
		}
	}()
	return r.handle(context.Background(), j)
}
