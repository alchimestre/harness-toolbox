package store

import (
	"encoding/json"
	"os"

	"example.com/goledger/src/ledger"
)

// Save writes the posted entries to path as a JSON array.
func Save(path string, entries []ledger.Entry) error {
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// Load reads entries previously written by Save.
func Load(path string) ([]ledger.Entry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var entries []ledger.Entry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}
