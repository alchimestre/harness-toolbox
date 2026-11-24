package config

import "testing"

func TestValidateRejectsZeroTTL(t *testing.T) {
	cfg := Config{TTLSeconds: 0, MaxMemoryMB: 1, WarmWorkers: 1}
	if err := cfg.Validate(); err == nil {
		t.Fatal("zero ttl accepted")
	}
}
