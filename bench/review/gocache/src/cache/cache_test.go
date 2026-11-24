package cache

import (
	"testing"
	"time"
)

func TestGetExpires(t *testing.T) {
	now := time.Unix(1000, 0)
	c := New(Options{TTL: time.Second, MaxBytes: 1 << 20})
	c.now = func() time.Time { return now }
	c.Set("a", []byte("x"))
	now = now.Add(2 * time.Second)
	if _, ok := c.Get("a"); ok {
		t.Fatal("expired entry returned")
	}
}

func TestInvalidateTag(t *testing.T) {
	c := New(Options{TTL: time.Minute, MaxBytes: 1 << 20})
	c.Set("a", []byte("x"), "t")
	c.Set("b", []byte("y"), "t")
	if n := c.InvalidateTag("t"); n != 2 {
		t.Fatalf("removed %d, want 2", n)
	}
}

func TestDeleteMissingKey(t *testing.T) {
	c := New(Options{TTL: time.Minute, MaxBytes: 1 << 20})
	c.Delete("missing")
	if c.Len() != 0 {
		t.Fatal("cache not empty")
	}
}
