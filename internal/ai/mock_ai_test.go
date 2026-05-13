package ai

import (
	"context"
	"testing"
)

// UT-AI-001: Chat — recommendation
func TestMockAI_Chat_Recommend(t *testing.T) {
	ai := NewMockAI()
	reply, actions, err := ai.Chat(context.Background(), "session-1", "推荐旅行")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply == "" {
		t.Error("expected non-empty reply")
	}
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	if actions[0].Type != "recommend" {
		t.Errorf("expected action type=recommend, got %s", actions[0].Type)
	}
}

// UT-AI-002: Chat — MBTI quiz
func TestMockAI_Chat_MBTI(t *testing.T) {
	ai := NewMockAI()
	reply, actions, err := ai.Chat(context.Background(), "session-1", "测性格")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply == "" {
		t.Error("expected non-empty reply")
	}
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	if actions[0].Type != "mbti_quiz" {
		t.Errorf("expected action type=mbti_quiz, got %s", actions[0].Type)
	}
}

// UT-AI-003: Chat — greeting
func TestMockAI_Chat_Greeting(t *testing.T) {
	ai := NewMockAI()
	reply, actions, err := ai.Chat(context.Background(), "session-1", "你好")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply == "" {
		t.Error("expected non-empty reply")
	}
	if len(actions) != 0 {
		t.Errorf("expected 0 actions, got %d", len(actions))
	}
}

// UT-AI-004: Chat — risk info
func TestMockAI_Chat_Risk(t *testing.T) {
	ai := NewMockAI()
	reply, actions, err := ai.Chat(context.Background(), "session-1", "风险等级")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply == "" {
		t.Error("expected non-empty reply")
	}
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	if actions[0].Type != "info" {
		t.Errorf("expected action type=info, got %s", actions[0].Type)
	}
}

// UT-AI-005: Chat — unknown input fallback
func TestMockAI_Chat_Fallback(t *testing.T) {
	ai := NewMockAI()
	reply, actions, err := ai.Chat(context.Background(), "session-1", "xyz123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reply == "" {
		t.Error("expected fallback reply")
	}
	if len(actions) != 0 {
		t.Errorf("expected 0 actions for unknown input, got %d", len(actions))
	}
}
