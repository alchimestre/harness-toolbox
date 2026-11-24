package ledger

import (
	"time"

	"example.com/goledger/src/money"
)

// Entry is one posted amount on an account.
type Entry struct {
	ID      string
	Account string
	Amount  money.Amount
	Date    time.Time
}
