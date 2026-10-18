package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testKey = "test-key-not-real"

func testCatalog(_ context.Context, lang string) ([]CatalogEntry, error) {
	title := "镜面 · 乌尤尼盐沼"
	if lang == "en" {
		title = "The Mirror · Salar de Uyuni"
	}
	return []CatalogEntry{
		{Slug: "bolivia-salt-flat-trek", Title: title, Hook: "…", Types: []string{"INFP"}},
		{Slug: "norway-aurora-hunt", Title: "Aurora", Hook: "…"},
	}, nil
}

// upstream fakes the DeepSeek chat endpoint, replying with content and recording the request.
func upstream(t *testing.T, status int, content string, delay time.Duration, seen *chatRequest, auth *string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.NotFound(w, r)
			return
		}
		if auth != nil {
			*auth = r.Header.Get("Authorization")
		}
		if seen != nil {
			_ = json.NewDecoder(r.Body).Decode(seen)
		}
		if delay > 0 {
			select {
			case <-time.After(delay):
			case <-r.Context().Done():
				return
			}
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"choices": []map[string]interface{}{{"message": map[string]string{"content": content}}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newTestGuide(url string, timeout time.Duration) *DeepSeek {
	return NewDeepSeek(DeepSeekConfig{APIKey: testKey, BaseURL: url, Timeout: timeout}, testCatalog, NewMockAI())
}

// UT-AI-DS-001: a good reply keeps only catalog journeys and sends a grounded, capped request.
func TestDeepSeek_Reply(t *testing.T) {
	var req chatRequest
	var auth string
	srv := upstream(t, http.StatusOK, `{"reply":"Before dawn, the sky comes down to the salt.","slugs":["bolivia-salt-flat-trek","made-up-place","bolivia-salt-flat-trek"]}`, 0, &req, &auth)
	r := newTestGuide(srv.URL, time.Second).Guide(context.Background(), GuideInput{Message: "somewhere quiet", Lang: "en", MBTI: "INFP"})

	if r.Source != "deepseek" || r.Reply == "" {
		t.Fatalf("expected a deepseek reply, got %+v", r)
	}
	if len(r.Actions) != 1 || r.Actions[0].Type != "recommend" {
		t.Fatalf("expected one recommend action, got %+v", r.Actions)
	}
	picks := r.Actions[0].Data.(map[string]interface{})["journeys"].([]map[string]string)
	if len(picks) != 1 || picks[0]["slug"] != "bolivia-salt-flat-trek" || picks[0]["title"] != "The Mirror · Salar de Uyuni" {
		t.Errorf("unknown or duplicate slugs must be dropped, got %+v", picks)
	}
	if auth != "Bearer "+testKey {
		t.Errorf("expected bearer auth")
	}
	if req.MaxTokens != 320 || req.ResponseFormat["type"] != "json_object" || req.Stream {
		t.Errorf("request not capped as expected: %+v", req)
	}
	system := req.Messages[0].Content
	for _, want := range []string{"Lumi", "bolivia-salt-flat-trek", "INFP", "never mention it", "Never name or describe personality types"} {
		if !strings.Contains(system, want) {
			t.Errorf("system prompt missing %q", want)
		}
	}
}

// UT-AI-DS-002: timeouts, upstream errors and unusable replies fall back to the rule-based guide.
func TestDeepSeek_FallsBack(t *testing.T) {
	cases := map[string]*httptest.Server{
		"timeout":   upstream(t, http.StatusOK, `{"reply":"late"}`, 300*time.Millisecond, nil, nil),
		"status":    upstream(t, http.StatusInternalServerError, ``, 0, nil, nil),
		"not json":  upstream(t, http.StatusOK, `just text`, 0, nil, nil),
		"no reply":  upstream(t, http.StatusOK, `{"reply":"  ","slugs":[]}`, 0, nil, nil),
		"wrong url": httptest.NewServer(http.NotFoundHandler()),
	}
	t.Cleanup(cases["wrong url"].Close)
	for name, srv := range cases {
		t.Run(name, func(t *testing.T) {
			start := time.Now()
			r := newTestGuide(srv.URL, 100*time.Millisecond).Guide(context.Background(), GuideInput{Message: "推荐旅行", Lang: "zh"})
			if r.Source != "mock" || r.Reply == "" {
				t.Fatalf("expected the rule-based fallback, got %+v", r)
			}
			if time.Since(start) > time.Second {
				t.Errorf("fallback took too long: %v", time.Since(start))
			}
		})
	}
}

// UT-AI-DS-003: when every slot is busy the guide answers from the rules at once.
func TestDeepSeek_ConcurrencyLimit(t *testing.T) {
	var calls atomic.Int32
	block := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		<-block
	}))
	defer srv.Close()
	defer close(block)
	g := NewDeepSeek(DeepSeekConfig{APIKey: testKey, BaseURL: srv.URL, Timeout: 2 * time.Second, MaxInFlight: 1}, testCatalog, NewMockAI())
	go g.Guide(context.Background(), GuideInput{Message: "a"})
	for calls.Load() == 0 {
		time.Sleep(5 * time.Millisecond)
	}
	start := time.Now()
	r := g.Guide(context.Background(), GuideInput{Message: "推荐"})
	if r.Source != "mock" || time.Since(start) > 200*time.Millisecond {
		t.Fatalf("expected an immediate fallback while busy, got %+v after %v", r, time.Since(start))
	}
}

// UT-AI-DS-004: logs never carry the key or what the model said.
func TestDeepSeek_LogsNoSecrets(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(os.Stderr)
	srv := upstream(t, http.StatusBadRequest, `{"reply":"secret-reply-text"}`, 0, nil, nil)
	newTestGuide(srv.URL, time.Second).Guide(context.Background(), GuideInput{Message: "my private message"})
	out := buf.String()
	for _, leak := range []string{testKey, "secret-reply-text", "my private message"} {
		if strings.Contains(out, leak) {
			t.Errorf("log leaked %q: %s", leak, out)
		}
	}
	if !strings.Contains(out, "status 400") {
		t.Errorf("expected the status code in the log, got %q", out)
	}
}
