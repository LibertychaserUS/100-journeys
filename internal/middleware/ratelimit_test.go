package middleware

import (
	"testing"
	"time"
)

// UT-MW-003: the bucket allows a burst, refuses the next and refills over time, per key.
func TestBucket_BurstAndRefill(t *testing.T) {
	now := time.Unix(0, 0)
	b := NewBucket(60, 3) // one a second
	b.now = func() time.Time { return now }
	for i := 0; i < 3; i++ {
		if ok, _ := b.Allow("a"); !ok {
			t.Fatalf("request %d of the burst refused", i+1)
		}
	}
	ok, wait := b.Allow("a")
	if ok || wait <= 0 || wait > time.Second {
		t.Fatalf("fourth request: ok=%v wait=%s", ok, wait)
	}
	if ok, _ := b.Allow("b"); !ok {
		t.Fatal("another key has its own bucket")
	}
	now = now.Add(1100 * time.Millisecond)
	if ok, _ := b.Allow("a"); !ok {
		t.Fatal("a token should have come back after a second")
	}
}
