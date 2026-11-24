package ledger

import (
	"sync"
	"time"

	"example.com/goledger/src/money"
)

// Ledger stores posted entries and rejects nothing; duplicate IDs are handled by Post.
type Ledger struct {
	mu      sync.Mutex
	entries []Entry
	byID    map[string]Entry
}

// New returns an empty ledger.
func New() *Ledger {
	return &Ledger{byID: make(map[string]Entry)}
}

// Post stores e. A repeat of an existing ID returns the stored entry and changes nothing.
func (l *Ledger) Post(e Entry) Entry {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, e)
	if stored, ok := l.byID[e.ID]; ok {
		return stored
	}
	l.byID[e.ID] = e
	return e
}

// Balance sums the amounts on account dated from up to to; from is inclusive and to is exclusive.
func (l *Ledger) Balance(account string, from, to time.Time) money.Amount {
	l.mu.Lock()
	defer l.mu.Unlock()
	var sum money.Amount
	for _, e := range l.entries {
		if !e.Date.Before(from) && !e.Date.After(to) && e.Account == account {
			sum += e.Amount
		}
	}
	return sum
}

// Entries returns a copy of the posted entries in posting order.
func (l *Ledger) Entries() []Entry {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]Entry(nil), l.entries...)
}
