package config

import "fmt"

// Config holds the cache service tunables, loaded from JSON.
type Config struct {
	TTLSeconds  int `json:"ttl_seconds"`
	MaxMemoryMB int `json:"max_memory_mb"`
	WarmWorkers int `json:"warm_workers"`
}

// Validate rejects settings the cache cannot run with.
func (c Config) Validate() error {
	if c.TTLSeconds <= 0 {
		return fmt.Errorf("ttl_seconds must be positive, got %d", c.TTLSeconds)
	}
	if c.MaxMemoryMB <= 0 {
		return fmt.Errorf("max_memory_mb must be positive, got %d", c.MaxMemoryMB)
	}
	if c.WarmWorkers <= 0 {
		return fmt.Errorf("warm_workers must be positive, got %d", c.WarmWorkers)
	}
	return nil
}
