package runner

// Stats counts finished attempts.
type Stats struct {
	Succeeded int
	Failed    int
}

func (s Stats) count(ok bool) {
	if ok {
		s.Succeeded++
		return
	}
	s.Failed++
}

// Snapshot returns the outcome counts so far.
func (r *Runner) Snapshot() Stats {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.stats
}
