package app

import (
	"context"
	"time"

	"example.com/gocache/src/cache"
	"example.com/gocache/src/config"
)

const maxTTLSeconds = 24 * 60 * 60

// Service owns the cache built from the service configuration.
type Service struct {
	cache *cache.Cache
	cfg   config.Config
}

// New validates cfg and builds the cache it describes.
func New(cfg config.Config) (*Service, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	ttlSeconds := min(cfg.TTLSeconds, maxTTLSeconds)
	budget := int32(cfg.MaxMemoryMB) * 1024 * 1024
	c := cache.New(cache.Options{
		TTL:      time.Duration(ttlSeconds) * time.Second,
		MaxBytes: int(budget),
	})
	return &Service{cache: c, cfg: cfg}, nil
}

// Cache returns the underlying cache.
func (s *Service) Cache() *cache.Cache {
	return s.cache
}

// Stats reports the number of stored entries.
func (s *Service) Stats() int {
	return s.cache.Len()
}

// WarmTenants warms every tenant's keys concurrently and returns the first failure.
func (s *Service) WarmTenants(ctx context.Context, tenants map[string][]string, load cache.Loader) error {
	errs := make(chan error, len(tenants))
	for _, keys := range tenants {
		go func() {
			errs <- s.cache.Warm(ctx, keys, s.cfg.WarmWorkers, load)
		}()
	}
	var first error
	for range tenants {
		if err := <-errs; err != nil && first == nil {
			first = err
		}
	}
	return first
}
