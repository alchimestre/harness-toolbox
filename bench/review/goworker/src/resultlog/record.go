package resultlog

import "time"

// Record is the outcome of one attempt, written as one JSON line.
type Record struct {
	JobID    string        `json:"job_id"`
	Attempt  int           `json:"attempt"`
	OK       bool          `json:"ok"`
	Error    string        `json:"error,omitempty"`
	Duration time.Duration `json:"duration_ns"`
}
