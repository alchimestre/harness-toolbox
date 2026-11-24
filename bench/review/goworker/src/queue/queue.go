package queue

import (
	"errors"
	"sync"

	"example.com/goworker/src/job"
)

// ErrEmpty is returned by Lease when no job is waiting.
var ErrEmpty = errors.New("queue: no pending jobs")

// Queue is an in-memory FIFO with at-least-once leases.
type Queue struct {
	mu       sync.Mutex
	pending  []job.Job
	inFlight map[string]job.Job
}

// New returns an empty queue.
func New() *Queue {
	return &Queue{inFlight: make(map[string]job.Job)}
}

// Push appends jobs to the back of the queue.
func (q *Queue) Push(jobs ...job.Job) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.pending = append(q.pending, jobs...)
}

// Lease moves the next pending job to in-flight.
func (q *Queue) Lease() (job.Job, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.pending) == 0 {
		return job.Job{}, ErrEmpty
	}
	next := q.pending[0]
	q.pending = q.pending[1:]
	q.inFlight[next.ID] = next
	return next, nil
}

// Ack removes a finished job from in-flight.
func (q *Queue) Ack(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	delete(q.inFlight, id)
}

// Nack returns an in-flight job to the front of the queue with its attempt count raised.
func (q *Queue) Nack(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	j, ok := q.inFlight[id]
	if !ok {
		return
	}
	delete(q.inFlight, id)
	j.Attempts++
	q.pending = append([]job.Job{j}, q.pending...)
}
