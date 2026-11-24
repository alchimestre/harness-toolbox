package resultlog

import (
	"encoding/json"
	"os"
	"sync"
)

// Log buffers records in memory and appends them to a JSON Lines file on Flush.
type Log struct {
	mu      sync.Mutex
	path    string
	pending []Record
}

// Open returns a log that writes to path.
func Open(path string) *Log {
	return &Log{path: path}
}

// Add buffers one record.
func (l *Log) Add(rec Record) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pending = append(l.pending, rec)
}

// Flush writes the buffered records and clears the buffer.
func (l *Log) Flush() error {
	l.mu.Lock()
	batch := l.pending
	l.pending = nil
	l.mu.Unlock()
	return l.WriteBatch(batch)
}

// WriteBatch appends every record in batch to the file.
func (l *Log) WriteBatch(batch []Record) error {
	for _, rec := range batch {
		f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		defer f.Close()
		if err := json.NewEncoder(f).Encode(rec); err != nil {
			return err
		}
	}
	return nil
}
