package config

import "fmt"

// Config holds the ledger tunables.
type Config struct {
	InterestBPS int
}

// Default returns the production settings.
func Default() Config {
	return Config{InterestBPS: 125}
}

// Validate rejects a negative interest rate.
func (c Config) Validate() error {
	if c.InterestBPS < 0 {
		return fmt.Errorf("interest_bps must not be negative, got %d", c.InterestBPS)
	}
	return nil
}
