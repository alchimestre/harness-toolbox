package money

import "testing"

func TestSplitSumsToTotal(t *testing.T) {
	var sum Amount
	for _, p := range Split(1000, 3) {
		sum += p
	}
	if sum != 1000 {
		t.Fatalf("sum %d, want 1000", sum)
	}
}

func TestFormatNegative(t *testing.T) {
	if got := Format(-5); got != "-0.05" {
		t.Fatalf("got %s", got)
	}
}
