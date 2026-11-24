package report

import (
	"time"

	"example.com/goledger/src/ledger"
	"example.com/goledger/src/money"
)

// Daily sums entry amounts per UTC calendar day, keyed "2006-01-02".
func Daily(entries []ledger.Entry) map[string]money.Amount {
	days := make(map[string]money.Amount)
	for _, e := range entries {
		day := e.Date.Format(time.DateOnly)
		days[day] = days[day] + e.Amount
	}
	return days
}
