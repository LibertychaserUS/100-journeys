package middleware

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Bucket is an in-process token bucket per account (or per client IP for guests). Nginx limits
// requests per IP in front of the app (see deploy/); this one limits what one account can do,
// which Nginx cannot see. Buckets idle for an hour are dropped.
type Bucket struct {
	rate  float64 // tokens per second
	burst float64

	mu      sync.Mutex
	buckets map[string]*tokens
	sweep   time.Time
	now     func() time.Time
}

type tokens struct {
	left float64
	at   time.Time
}

// NewBucket allows burst requests at once and refills perMinute tokens a minute.
func NewBucket(perMinute, burst int) *Bucket {
	return &Bucket{rate: float64(perMinute) / 60, burst: float64(burst), buckets: map[string]*tokens{}, now: time.Now}
}

// Allow takes a token for key, or reports how long until one is free.
func (b *Bucket) Allow(key string) (bool, time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	if now.Sub(b.sweep) > time.Hour {
		for k, t := range b.buckets {
			if now.Sub(t.at) > time.Hour {
				delete(b.buckets, k)
			}
		}
		b.sweep = now
	}
	t, ok := b.buckets[key]
	if !ok {
		t = &tokens{left: b.burst, at: now}
		b.buckets[key] = t
	}
	t.left = math.Min(b.burst, t.left+now.Sub(t.at).Seconds()*b.rate)
	t.at = now
	if t.left >= 1 {
		t.left--
		return true, 0
	}
	return false, time.Duration((1 - t.left) / b.rate * float64(time.Second))
}

// Limit is the middleware: 429 with Retry-After when the caller's bucket is empty.
func (b *Bucket) Limit() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := "ip:" + c.ClientIP()
		if uid, ok := c.Get("user_id"); ok {
			if id, ok := uid.(int64); ok && id > 0 {
				key = "user:" + strconv.FormatInt(id, 10)
			}
		}
		ok, wait := b.Allow(key)
		if !ok {
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"data": nil, "error": "too many requests"})
			return
		}
		c.Next()
	}
}
