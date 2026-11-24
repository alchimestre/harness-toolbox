package job

// Job is one unit of work leased from the queue.
type Job struct {
	ID       string
	Payload  []byte
	Attempts int
}
