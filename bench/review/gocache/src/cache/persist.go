package cache

import (
	"encoding/json"
	"errors"
	"io"
	"time"
)

const snapshotVersion = 2

// ErrSnapshotVersion is returned when a snapshot was written by another format version.
var ErrSnapshotVersion = errors.New("cache: unsupported snapshot version")

var errEmptyKey = errors.New("cache: snapshot entry has no key")

type snapshotEntry struct {
	Key     string    `json:"key"`
	Value   []byte    `json:"value"`
	Expires time.Time `json:"expires"`
	Tags    []string  `json:"tags,omitempty"`
}

type snapshot struct {
	Version int             `json:"version"`
	Entries []snapshotEntry `json:"entries"`
}

// Save writes every stored entry to w as JSON.
func (c *Cache) Save(w io.Writer) error {
	c.mu.RLock()
	snap := snapshot{Version: snapshotVersion, Entries: make([]snapshotEntry, 0, len(c.entries))}
	for key, e := range c.entries {
		snap.Entries = append(snap.Entries, snapshotEntry{Key: key, Value: e.value, Expires: e.expires, Tags: e.tags})
	}
	c.mu.RUnlock()
	return json.NewEncoder(w).Encode(snap)
}

// Restore replaces the cache contents with the snapshot read from r. It stops at the first
// entry it cannot load and returns that error.
func (c *Cache) Restore(r io.Reader) (loaded int, err error) {
	var snap snapshot
	if err := json.NewDecoder(r).Decode(&snap); err != nil {
		return 0, err
	}
	if snap.Version != snapshotVersion {
		return 0, ErrSnapshotVersion
	}
	c.reset(len(snap.Entries))
	for _, se := range snap.Entries {
		if err := c.load(se); err != nil {
			break
		}
		loaded++
	}
	return loaded, err
}

func (c *Cache) reset(size int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.used = 0
	if size == 0 {
		c.entries, c.tags = nil, nil
		return
	}
	c.entries = make(map[string]*entry, size)
	c.tags = make(map[string][]string)
}

func (c *Cache) load(se snapshotEntry) error {
	if se.Key == "" {
		return errEmptyKey
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.removeLocked(se.Key)
	c.entries[se.Key] = &entry{value: se.Value, expires: se.Expires, tags: se.Tags}
	c.used += len(se.Value)
	for _, tag := range se.Tags {
		c.tags[tag] = append(c.tags[tag], se.Key)
	}
	c.evictLocked()
	return nil
}
