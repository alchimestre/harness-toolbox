package main

import (
	"fmt"
	"maps"
	"slices"
	"time"

	"example.com/goledger/src/config"
	"example.com/goledger/src/ledger"
	"example.com/goledger/src/money"
	"example.com/goledger/src/report"
)

func main() {
	cfg := config.Default()
	if err := cfg.Validate(); err != nil {
		panic(err)
	}
	l := ledger.New()
	day := time.Date(2024, 3, 1, 12, 0, 0, 0, time.UTC)
	l.Post(ledger.Entry{ID: "a1", Account: "main", Amount: 10000, Date: day})
	l.Post(ledger.Entry{ID: "a2", Account: "main", Amount: 5025, Date: day.Add(24 * time.Hour)})
	interest := ledger.Accrue(l.Balance("main", day, day.Add(48*time.Hour)), cfg.InterestBPS)
	fmt.Println("interest:", money.Format(interest))
	days := report.Daily(l.Entries())
	for _, d := range slices.Sorted(maps.Keys(days)) {
		fmt.Println(d, money.Format(days[d]))
	}
}
