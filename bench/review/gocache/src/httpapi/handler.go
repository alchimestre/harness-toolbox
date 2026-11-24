package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"example.com/gocache/src/app"
	"example.com/gocache/src/metrics"
)

// Handler serves the cache over HTTP under /keys/ and /stats.
type Handler struct {
	svc     *app.Service
	metrics *metrics.Counters
}

// New returns a handler backed by svc.
func New(svc *app.Service, m *metrics.Counters) *Handler {
	return &Handler{svc: svc, metrics: m}
}

// ServeHTTP routes requests to the get, put, delete and stats handlers.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/stats":
		h.stats(w)
	case strings.HasPrefix(r.URL.Path, "/keys/"):
		h.key(w, r, strings.TrimPrefix(r.URL.Path, "/keys/"))
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) key(w http.ResponseWriter, r *http.Request, key string) {
	switch r.Method {
	case http.MethodGet:
		h.get(w, key)
	case http.MethodPut:
		h.put(w, r, key)
	case http.MethodDelete:
		h.svc.Cache().Delete(key)
		h.metrics.Deletes.Add(1)
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *Handler) get(w http.ResponseWriter, key string) {
	value, ok := h.svc.Cache().Get(key)
	if !ok {
		h.metrics.Misses.Add(1)
		http.NotFound(w, nil)
		return
	}
	h.metrics.Hits.Add(1)
	_, _ = w.Write(value)
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request, key string) {
	var body struct {
		Value string   `json:"value"`
		Tags  []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.svc.Cache().Set(key, []byte(body.Value), body.Tags...)
	h.metrics.Writes.Add(1)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) stats(w http.ResponseWriter) {
	payload := map[string]any{"entries": h.svc.Stats(), "counters": h.metrics.Snapshot()}
	_ = json.NewEncoder(w).Encode(payload)
}
