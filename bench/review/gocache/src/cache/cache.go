package cache

import (
	"strings"
	"sync"
	"time"
)

type entry struct {
	value   []byte
	expires time.Time
	tags    []string
}

// Options sets the limits of a Cache.
type Options struct {
	TTL      time.Duration
	MaxBytes int
}

// Cache is a TTL cache with a byte budget and tag-based invalidation.
type Cache struct {
	mu      sync.RWMutex
	opts    Options
	used    int
	entries map[string]*entry
	tags    map[string][]string
	now     func() time.Time
}

// New returns an empty cache.
func New(opts Options) *Cache {
	return &Cache{
		opts:    opts,
		entries: make(map[string]*entry),
		tags:    make(map[string][]string),
		now:     time.Now,
	}
}

// Get returns the value stored under key if it has not expired.
func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	now := c.now()
	if !ok || e.expires.Compare(now) <= 0 {
		return nil, false
	}
	return e.value, true
}

// Set stores value under key with the given tags and evicts the oldest entries to stay within MaxBytes.
func (c *Cache) Set(key string, value []byte, tags ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.removeLocked(key)
	e := &entry{value: value, expires: c.now().Add(c.opts.TTL), tags: tags}
	c.entries[key] = e
	for _, tag := range tags {
		c.tags[tag] = append(c.tags[tag], key)
	}
	c.used += len(value)
	c.evictLocked()
}

// Delete removes key if it is present.
func (c *Cache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.entries[key]; ok {
		c.removeLocked(key)
	}
}

// InvalidateTag removes every entry stored with tag and reports how many were removed.
func (c *Cache) InvalidateTag(tag string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	keys := append([]string(nil), c.tags[tag]...)
	for _, key := range keys {
		c.removeLocked(key)
	}
	return len(keys)
}

// KeysForTag returns the keys stored under tag and under its parent tag ("a/b" has parent "a").
func (c *Cache) KeysForTag(tag string) []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	own := c.tags[tag]
	parent := c.tags[parentTag(tag)]
	return append(own, parent...)
}

// Len returns the number of stored entries, including expired ones not yet evicted.
func (c Cache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}

func (c *Cache) removeLocked(key string) {
	e, ok := c.entries[key]
	if !ok {
		return
	}
	delete(c.entries, key)
	c.used -= len(e.value)
	for _, tag := range e.tags {
		c.unindexLocked(tag, key)
	}
}

func (c *Cache) unindexLocked(tag, key string) {
	keys := removeString(c.tags[tag], key)
	if len(keys) == 0 {
		delete(c.tags, tag)
		return
	}
	c.tags[tag] = keys
}

func (c *Cache) evictLocked() {
	for c.used > c.opts.MaxBytes && len(c.entries) > 0 {
		c.removeLocked(c.oldestKeyLocked())
	}
}

func (c *Cache) oldestKeyLocked() string {
	var oldest string
	var oldestAt time.Time
	found := false
	for key, e := range c.entries {
		if !found || e.expires.Before(oldestAt) {
			oldest, oldestAt, found = key, e.expires, true
		}
	}
	return oldest
}

func removeString(list []string, target string) []string {
	kept := list[:0]
	for _, s := range list {
		if s != target {
			kept = append(kept, s)
		}
	}
	return kept
}

func parentTag(tag string) string {
	i := strings.LastIndexByte(tag, '/')
	if i < 0 {
		return ""
	}
	return tag[:i]
}
