package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"example.com/goledger/src/ledger"
	"example.com/goledger/src/metrics"
	"example.com/goledger/src/money"
)

// Handler exposes posting and balances over HTTP.
type Handler struct {
	ledger  *ledger.Ledger
	metrics *metrics.Counters
}

// New returns a handler backed by l.
func New(l *ledger.Ledger, m *metrics.Counters) *Handler {
	return &Handler{ledger: l, metrics: m}
}

// ServeHTTP routes POST /entries and GET /balance.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/entries":
		h.post(w, r)
	case "/balance":
		h.balance(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) post(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var e ledger.Entry
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	stored := h.ledger.Post(e)
	h.metrics.Posts.Add(1)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(stored)
}

func (h *Handler) balance(w http.ResponseWriter, r *http.Request) {
	from, to, err := dateRange(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.metrics.Balances.Add(1)
	total := h.ledger.Balance(r.URL.Query().Get("account"), from, to)
	_, _ = w.Write([]byte(money.Format(total) + "\n"))
}

func dateRange(r *http.Request) (time.Time, time.Time, error) {
	layout := time.DateOnly
	from, err := time.Parse(layout, r.URL.Query().Get("from"))
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	to, err := time.Parse(layout, r.URL.Query().Get("to"))
	return from, to, err
}
