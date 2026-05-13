package ai

import (
	"context"
	"testing"

	"github.com/100-journeys/app/internal/model"
)

// mockRepoForEngine implements repository.JourneyRepository
type mockRepoForEngine struct {
	journeys []model.Journey
}

func (m *mockRepoForEngine) List(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error) {
	var result []model.Journey
	for _, j := range m.journeys {
		// Simulate MBTI filter
		if filter.MBTIType != "" {
			matched := false
			for _, jm := range j.MBTITypes {
				if jm.MBTIType.Code == filter.MBTIType {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		result = append(result, j)
	}
	return result, len(result), nil
}

func (m *mockRepoForEngine) GetBySlug(ctx context.Context, slug string) (*model.Journey, error) {
	for _, j := range m.journeys {
		if j.Slug == slug {
			return &j, nil
		}
	}
	return nil, nil
}

func (m *mockRepoForEngine) ListTags(ctx context.Context) ([]model.Tag, error) {
	return nil, nil
}

func (m *mockRepoForEngine) ListMBTITypes(ctx context.Context) ([]model.MBTIType, error) {
	return nil, nil
}

func makeTestJourneys() []model.Journey {
	return []model.Journey{
		{
			ID: 1, Title: "冰岛极光", Slug: "iceland-aurora",
			MoodKeywords: []string{"孤独", "极光", "寒冷"},
			MBTITypes: []model.JourneyMBTI{
				{MBTIType: model.MBTIType{Code: "INFP"}, CompatibilityScore: 95},
				{MBTIType: model.MBTIType{Code: "INTJ"}, CompatibilityScore: 80},
			},
		},
		{
			ID: 2, Title: "撒哈拉沙漠", Slug: "sahara-dunes",
			MoodKeywords: []string{"孤独", "沙漠", "炎热"},
			MBTITypes: []model.JourneyMBTI{
				{MBTIType: model.MBTIType{Code: "INFP"}, CompatibilityScore: 70},
			},
		},
		{
			ID: 3, Title: "东京街头", Slug: "tokyo-streets",
			MoodKeywords: []string{"城市", "霓虹", "热闹"},
			MBTITypes: []model.JourneyMBTI{
				{MBTIType: model.MBTIType{Code: "ENTP"}, CompatibilityScore: 90},
			},
		},
	}
}

// UT-ENG-001: Recommend by MBTI
func TestRecommendEngine_ByMBTI(t *testing.T) {
	repo := &mockRepoForEngine{journeys: makeTestJourneys()}
	engine := NewRecommendEngine(repo)

	results, err := engine.Recommend(context.Background(), "INFP", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected recommendations for INFP")
	}
	// INFP-compatible journeys: Iceland (95) and Sahara (70)
	// Iceland should be first due to higher score
	if results[0].Slug != "iceland-aurora" {
		t.Errorf("expected first result=iceland-aurora, got %s", results[0].Slug)
	}
}

// UT-ENG-002: Recommend by keywords
func TestRecommendEngine_ByKeywords(t *testing.T) {
	repo := &mockRepoForEngine{journeys: makeTestJourneys()}
	engine := NewRecommendEngine(repo)

	results, err := engine.Recommend(context.Background(), "", []string{"孤独"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected keyword-based recommendations")
	}
}

// UT-ENG-003: Fallback keyword search when no MBTI match
func TestRecommendEngine_Fallback(t *testing.T) {
	repo := &mockRepoForEngine{journeys: makeTestJourneys()}
	engine := NewRecommendEngine(repo)

	// No MBTI match for ESTJ, but keyword "孤独" matches Iceland and Sahara
	results, err := engine.Recommend(context.Background(), "ESTJ", []string{"孤独"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected fallback recommendations")
	}
}

// UT-ENG-004: Limit results to top 3
func TestRecommendEngine_Limit3(t *testing.T) {
	repo := &mockRepoForEngine{journeys: makeTestJourneys()}
	engine := NewRecommendEngine(repo)

	results, err := engine.Recommend(context.Background(), "INFP", []string{"孤独", "沙漠", "极光"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) > 3 {
		t.Errorf("expected at most 3 results, got %d", len(results))
	}
}

// UT-ENG-005: Empty results when no match
func TestRecommendEngine_NoMatch(t *testing.T) {
	repo := &mockRepoForEngine{journeys: makeTestJourneys()}
	engine := NewRecommendEngine(repo)

	results, err := engine.Recommend(context.Background(), "ESTJ", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for non-matching MBTI with no keywords, got %d", len(results))
	}
}
