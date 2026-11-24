package money

import "fmt"

// Amount is a sum of money in cents.
type Amount int64

// Format renders the amount with two decimals, e.g. 1234 becomes "12.34".
func Format(a Amount) string {
	sign := ""
	if a < 0 {
		sign = "-"
		a = -a
	}
	return fmt.Sprintf("%s%d.%02d", sign, a/100, a%100)
}

// Split divides total into n parts that differ by at most one cent; the first parts get the extra cents.
func Split(total Amount, n int) []Amount {
	parts := make([]Amount, n)
	base := total / Amount(n)
	rem := total % Amount(n)
	for i := range parts {
		parts[i] = base
		if Amount(i) <= rem {
			parts[i]++
		}
	}
	return parts
}
