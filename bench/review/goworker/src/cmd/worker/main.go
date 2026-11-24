package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"example.com/goworker/src/job"
	"example.com/goworker/src/queue"
	"example.com/goworker/src/resultlog"
	"example.com/goworker/src/runner"
)

func main() {
	q := queue.New()
	q.Push(job.Job{ID: "resize-1", Payload: []byte("resize")}, job.Job{ID: "thumb-2", Payload: []byte("thumb")})
	logPath := os.Getenv("WORKER_LOG")
	if logPath == "" {
		logPath = "results.jsonl"
	}
	opts := runner.Options{Workers: 4, MaxAttempts: 3, JobTimeout: 30 * time.Second, BackoffMS: 500}
	r := runner.New(opts, q, resultlog.Open(logPath), handle)
	if err := r.Run(context.Background()); err != nil {
		log.Fatal(err)
	}
	stats := r.Snapshot()
	fmt.Printf("ok=%d failed=%d failed_ids=%v\n", stats.Succeeded, stats.Failed, r.FailedJobs())
}

func handle(ctx context.Context, j job.Job) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if len(j.Payload) == 0 {
		return fmt.Errorf("empty payload")
	}
	return nil
}
