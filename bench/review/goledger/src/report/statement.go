package report

import (
	"fmt"
	"strings"

	"example.com/goledger/src/ledger"
	"example.com/goledger/src/money"
)

// Statement lists the entries of one account, one per line, followed by the running total.
func Statement(entries []ledger.Entry, account string) string {
	var b strings.Builder
	var total money.Amount
	for _, e := range entries {
		if e.Account != account {
			continue
		}
		total = total + e.Amount
		fmt.Fprintf(&b, "%s %-12s %10s\n", e.Date.UTC().Format("2006-01-02"), e.ID, money.Format(e.Amount))
	}
	fmt.Fprintf(&b, "total %s\n", money.Format(total))
	return b.String()
}
