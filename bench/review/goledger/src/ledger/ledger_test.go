package ledger

import (
	"testing"
	"time"

	"example.com/goledger/src/money"
)

func TestPostIsIdempotent(t *testing.T) {
	l := New()
	e := Entry{ID: "x", Account: "a", Amount: 100, Date: time.Unix(0, 0)}
	l.Post(e)
	l.Post(e)
	if got := l.Balance("a", time.Unix(0, 0), time.Unix(10, 0)); got != 100 {
		t.Fatalf("balance %d, want 100", got)
	}
}

func TestAccrueZeroRate(t *testing.T) {
	if got := Accrue(money.Amount(5000), 0); got != 0 {
		t.Fatalf("accrue %d, want 0", got)
	}
}
