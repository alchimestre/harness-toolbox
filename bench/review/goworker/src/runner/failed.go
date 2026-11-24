package runner

import (
	"maps"
	"slices"
)

func (r *Runner) markFailed(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failed[id] = true
}

// FailedJobs returns the IDs of jobs that exhausted their attempts, sorted.
func (r *Runner) FailedJobs() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Sorted(maps.Keys(r.failed))
}
