package service

import (
	"context"
	"fmt"
	"testing"

	"github.com/100-journeys/app/internal/model"
)

// ---------- Mocks ----------

type mockRepo struct {
	listFn        func(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error)
	getBySlugFn   func(ctx context.Context, slug string) (*model.Journey, error)
	listTagsFn    func(ctx context.Context) ([]model.Tag, error)
	listMBTIFn    func(ctx context.Context) ([]model.MBTIType, error)
}

func (m *mockRepo) List(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error) {
	if m.listFn != nil {
		return m.listFn(ctx, filter)
	}
	return nil, 0, nil
}

func (m *mockRepo) GetBySlug(ctx context.Context, slug string) (*model.Journey, error) {
	if m.getBySlugFn != nil {
		return m.getBySlugFn(ctx, slug)
	}
	return nil, nil
}

func (m *mockRepo) ListTags(ctx context.Context) ([]model.Tag, error) {
	if m.listTagsFn != nil {
		return m.listTagsFn(ctx)
	}
	return nil, nil
}

func (m *mockRepo) ListMBTITypes(ctx context.Context) ([]model.MBTIType, error) {
	if m.listMBTIFn != nil {
		return m.listMBTIFn(ctx)
	}
	return nil, nil
}

type mockMedia struct {
	baseURL string
}

func (m *mockMedia) ResolveURL(path string) string {
	if path == "" {
		return ""
	}
	return m.baseURL + "/" + path
}

// ---------- Tests ----------

// UT-SVC-001: ListJourneys with default pagination
func TestService_ListJourneys_Defaults(t *testing.T) {
	repo := &mockRepo{
		listFn: func(_ context.Context, filter model.JourneyFilter) ([]model.Journey, int, error) {
			if filter.Limit != 12 {
				t.Errorf("expected default limit=12, got %d", filter.Limit)
			}
			if filter.Page != 1 {
				t.Errorf("expected default page=1, got %d", filter.Page)
			}
			return []model.Journey{{ID: 1, Title: "Test"}}, 1, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{baseURL: "http://cdn"})
	journeys, total, err := svc.ListJourneys(context.Background(), model.JourneyFilter{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 1 {
		t.Errorf("expected total=1, got %d", total)
	}
	if len(journeys) != 1 {
		t.Errorf("expected 1 journey, got %d", len(journeys))
	}
}

// UT-SVC-002: ListJourneys resolves image URLs
func TestService_ListJourneys_ImageResolution(t *testing.T) {
	repo := &mockRepo{
		listFn: func(_ context.Context, _ model.JourneyFilter) ([]model.Journey, int, error) {
			return []model.Journey{
				{ID: 1, Title: "Test", ImagePath: "photos/test.jpg"},
			}, 1, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{baseURL: "http://cdn"})
	journeys, _, _ := svc.ListJourneys(context.Background(), model.JourneyFilter{Limit: 10})
	if journeys[0].ImageURL != "http://cdn/photos/test.jpg" {
		t.Errorf("expected ImageURL=http://cdn/photos/test.jpg, got %s", journeys[0].ImageURL)
	}
}

// UT-SVC-003: GetJourney existing
func TestService_GetJourney_Exists(t *testing.T) {
	repo := &mockRepo{
		getBySlugFn: func(_ context.Context, slug string) (*model.Journey, error) {
			return &model.Journey{ID: 1, Title: "Found", Slug: slug, ImagePath: "a.jpg"}, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{baseURL: "http://cdn"})
	j, err := svc.GetJourney(context.Background(), "found")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if j == nil {
		t.Fatal("expected journey, got nil")
	}
	if j.ImageURL != "http://cdn/a.jpg" {
		t.Errorf("expected resolved URL, got %s", j.ImageURL)
	}
}

// UT-SVC-004: GetJourney not found
func TestService_GetJourney_NotFound(t *testing.T) {
	repo := &mockRepo{
		getBySlugFn: func(_ context.Context, _ string) (*model.Journey, error) {
			return nil, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{baseURL: "http://cdn"})
	j, err := svc.GetJourney(context.Background(), "missing")
	if err == nil {
		t.Fatal("expected error for missing journey")
	}
	if j != nil {
		t.Fatal("expected nil journey")
	}
	if err.Error() != "journey not found: missing" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

// UT-SVC-005: ListTags delegates to repo
func TestService_ListTags(t *testing.T) {
	called := false
	repo := &mockRepo{
		listTagsFn: func(_ context.Context) ([]model.Tag, error) {
			called = true
			return []model.Tag{{ID: 1, Name: "Nature"}}, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{})
	tags, err := svc.ListTags(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Error("expected repo.ListTags to be called")
	}
	if len(tags) != 1 {
		t.Errorf("expected 1 tag, got %d", len(tags))
	}
}

// UT-SVC-006: GetBookingInfo
func TestService_GetBookingInfo(t *testing.T) {
	url := "https://book.example.com/trip"
	repo := &mockRepo{
		getBySlugFn: func(_ context.Context, _ string) (*model.Journey, error) {
			return &model.Journey{ID: 1, Title: "Trip", BookingURL: &url}, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{})
	info, err := svc.GetBookingInfo(context.Background(), "trip")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected booking info")
	}
	if !info.BookingAvailable {
		t.Error("expected booking available")
	}
	if info.BookingURL == nil || *info.BookingURL != url {
		t.Error("expected booking URL")
	}
}

// UT-SVC-007: ListJourneys propagates error
func TestService_ListJourneys_Error(t *testing.T) {
	repo := &mockRepo{
		listFn: func(_ context.Context, _ model.JourneyFilter) ([]model.Journey, int, error) {
			return nil, 0, fmt.Errorf("db error")
		},
	}
	svc := NewJourneyService(repo, &mockMedia{})
	_, _, err := svc.ListJourneys(context.Background(), model.JourneyFilter{Limit: 10})
	if err == nil {
		t.Fatal("expected error")
	}
}

// UT-SVC-008: GetJourney propagates db error
func TestService_GetJourney_DBError(t *testing.T) {
	repo := &mockRepo{
		getBySlugFn: func(_ context.Context, _ string) (*model.Journey, error) {
			return nil, fmt.Errorf("connection lost")
		},
	}
	svc := NewJourneyService(repo, &mockMedia{})
	_, err := svc.GetJourney(context.Background(), "any")
	if err == nil {
		t.Fatal("expected error")
	}
}

// UT-SVC-009: ListMBTITypes
func TestService_ListMBTITypes(t *testing.T) {
	repo := &mockRepo{
		listMBTIFn: func(_ context.Context) ([]model.MBTIType, error) {
			return []model.MBTIType{{ID: 1, Code: "INFP"}}, nil
		},
	}
	svc := NewJourneyService(repo, &mockMedia{})
	types, err := svc.ListMBTITypes(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(types) != 1 {
		t.Errorf("expected 1 type, got %d", len(types))
	}
}
