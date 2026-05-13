package service

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
)

// CaptchaStore holds generated captchas in memory with TTL.
type CaptchaStore struct {
	mu       sync.RWMutex
	answers  map[string]string // captcha_id -> answer
	expires  map[string]time.Time
	ttl      time.Duration
}

// NewCaptchaStore creates a new in-memory captcha store.
func NewCaptchaStore() *CaptchaStore {
	s := &CaptchaStore{
		answers: make(map[string]string),
		expires: make(map[string]time.Time),
		ttl:     5 * time.Minute,
	}
	go s.cleanupLoop()
	return s
}

// Generate creates a new math captcha and returns its ID, question, and answer.
func (s *CaptchaStore) Generate() (id string, question string, answer string) {
	// Generate two random numbers 1-20
	a, _ := rand.Int(rand.Reader, big.NewInt(20))
	b, _ := rand.Int(rand.Reader, big.NewInt(20))
	n1 := int(a.Int64()) + 1
	n2 := int(b.Int64()) + 1

	// Randomly choose operation: + or -
	var ans int
	var op string
	if n1 >= n2 {
		ans = n1 - n2
		op = "-"
	} else {
		ans = n1 + n2
		op = "+"
	}

	id = generateID()
	question = fmt.Sprintf("%d %s %d = ?", n1, op, n2)
	answer = fmt.Sprintf("%d", ans)

	s.mu.Lock()
	s.answers[id] = answer
	s.expires[id] = time.Now().Add(s.ttl)
	s.mu.Unlock()

	return id, question, answer
}

// Verify checks if the answer matches the stored captcha.
func (s *CaptchaStore) Verify(id, answer string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	exp, ok := s.expires[id]
	if !ok || time.Now().After(exp) {
		return false
	}

	stored := s.answers[id]
	delete(s.answers, id)
	delete(s.expires, id)

	return strings.TrimSpace(answer) == stored
}

// cleanupLoop periodically removes expired captchas.
func (s *CaptchaStore) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for id, exp := range s.expires {
			if now.After(exp) {
				delete(s.answers, id)
				delete(s.expires, id)
			}
		}
		s.mu.Unlock()
	}
}

func generateID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 16)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}
