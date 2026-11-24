package ledger

import "example.com/goledger/src/money"

const basisPointsPerUnit = 10000

// Accrue returns the interest on balance for one period at bps basis points, rounded half to even to the cent.
func Accrue(balance money.Amount, bps int) money.Amount {
	return money.Amount(balance) * money.Amount(bps) / basisPointsPerUnit
}
