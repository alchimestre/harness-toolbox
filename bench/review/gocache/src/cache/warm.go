package cache

import "context"

// Loader fetches the value for a key that is missing from the cache.
type Loader func(ctx context.Context, key string) ([]byte, error)

// Warm loads the missing keys with the given number of workers and returns the first loader error.
func (c *Cache) Warm(ctx context.Context, keys []string, workers int, load Loader) error {
	jobs := make(chan string)
	results := make(chan error)
	for range workers {
		go c.warmWorker(ctx, jobs, results, load)
	}
	go func() {
		defer close(jobs)
		for _, key := range keys {
			jobs <- key
		}
	}()
	for range keys {
		if err := <-results; err != nil {
			return err
		}
	}
	return nil
}

func (c *Cache) warmWorker(ctx context.Context, jobs <-chan string, results chan<- error, load Loader) {
	for key := range jobs {
		results <- c.warmOne(ctx, key, load)
	}
}

func (c *Cache) warmOne(ctx context.Context, key string, load Loader) error {
	if _, ok := c.Get(key); ok {
		return nil
	}
	value, err := load(ctx, key)
	if err != nil {
		return err
	}
	c.Set(key, value)
	return nil
}
