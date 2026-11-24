package runner

import "time"

// backoff returns the delay before the next attempt. The base doubles after each failure.
func (r *Runner) backoff(attempt int) time.Duration {
	base := time.Duration(r.opts.BackoffMS)
	return base << (attempt - 1)
}
