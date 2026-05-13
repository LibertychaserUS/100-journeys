package repository

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/model"
	_ "modernc.org/sqlite"
)

// setupTestDB creates an in-memory SQLite DB with schema + seed applied.
func setupTestDB(t *testing.T) *sqliteJourneyRepo {
	t.Helper()

	// Tests run from internal/repository/ — project root is two levels up.
	projectRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("resolve project root: %v", err)
	}

	db, err := NewDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := Migrate(db, filepath.Join(projectRoot, "db/schema.sql")); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := Seed(db, filepath.Join(projectRoot, "db/seed.sql")); err != nil {
		t.Fatalf("seed: %v", err)
	}

	return NewJourneyRepository(db).(*sqliteJourneyRepo)
}

// UT-REPO-001: List all journeys
func TestRepo_List_All(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, total, err := repo.List(ctx, model.JourneyFilter{Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if total != 5 {
		t.Errorf("expected total=5, got %d", total)
	}
	if len(journeys) != 5 {
		t.Errorf("expected 5 journeys, got %d", len(journeys))
	}
}

// UT-REPO-002: Filter by tag slug
func TestRepo_List_FilterTag(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, total, err := repo.List(ctx, model.JourneyFilter{TagSlug: "extreme", Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if total == 0 {
		t.Error("expected at least one journey with tag 'extreme'")
	}
	for _, j := range journeys {
		found := false
		for _, tag := range j.Tags {
			if tag.Slug == "extreme" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("journey %s missing tag 'extreme'", j.Slug)
		}
	}
}

// UT-REPO-003: Filter by visual_style
func TestRepo_List_FilterVisualStyle(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, total, err := repo.List(ctx, model.JourneyFilter{VisualStyle: "surreal", Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if total == 0 {
		t.Error("expected at least one surreal journey")
	}
	for _, j := range journeys {
		if j.VisualStyle != "surreal" {
			t.Errorf("expected visual_style=surreal, got %s", j.VisualStyle)
		}
	}
}

// UT-REPO-004: Filter by fantasy_type
func TestRepo_List_FilterFantasyType(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, total, err := repo.List(ctx, model.JourneyFilter{FantasyType: "extreme", Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if total == 0 {
		t.Error("expected at least one extreme journey")
	}
	for _, j := range journeys {
		if j.FantasyType != "extreme" {
			t.Errorf("expected fantasy_type=extreme, got %s", j.FantasyType)
		}
	}
}

// UT-REPO-005: Filter by adventure range
func TestRepo_List_FilterAdventureRange(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, total, err := repo.List(ctx, model.JourneyFilter{AdventureMin: 5, AdventureMax: 8, Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if total == 0 {
		t.Error("expected journeys in adventure range 5-8")
	}
	for _, j := range journeys {
		if j.AdventureIndex < 5 || j.AdventureIndex > 8 {
			t.Errorf("journey %s adventure_index=%d out of range [5,8]", j.Slug, j.AdventureIndex)
		}
	}
}

// UT-REPO-006: Filter by MBTI type
func TestRepo_List_FilterMBTI(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	journeys, _, err := repo.List(ctx, model.JourneyFilter{MBTIType: "INFP", Limit: 10, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	for _, j := range journeys {
		found := false
		for _, jm := range j.MBTITypes {
			if jm.MBTIType.Code == "INFP" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("journey %s not compatible with INFP", j.Slug)
		}
	}
}

// UT-REPO-007: GetBySlug — existing
func TestRepo_GetBySlug_Exists(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	// Pick first journey from list
	journeys, _, _ := repo.List(ctx, model.JourneyFilter{Limit: 1, Page: 1})
	if len(journeys) == 0 {
		t.Fatal("no seed journeys")
	}
	slug := journeys[0].Slug

	j, err := repo.GetBySlug(ctx, slug)
	if err != nil {
		t.Fatalf("GetBySlug error: %v", err)
	}
	if j == nil {
		t.Fatal("expected journey, got nil")
	}
	if j.Slug != slug {
		t.Errorf("expected slug=%s, got %s", slug, j.Slug)
	}
	if len(j.Tags) == 0 {
		t.Error("expected tags to be preloaded")
	}
}

// UT-REPO-008: GetBySlug — not found
func TestRepo_GetBySlug_NotFound(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	j, err := repo.GetBySlug(ctx, "nonexistent-journey")
	if err != nil {
		t.Fatalf("expected no error for missing slug, got %v", err)
	}
	if j != nil {
		t.Error("expected nil for missing journey")
	}
}

// UT-REPO-009: ListTags
func TestRepo_ListTags(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	tags, err := repo.ListTags(ctx)
	if err != nil {
		t.Fatalf("ListTags error: %v", err)
	}
	if len(tags) == 0 {
		t.Error("expected tags from seed data")
	}
}

// UT-REPO-010: ListMBTITypes
func TestRepo_ListMBTITypes(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	types, err := repo.ListMBTITypes(ctx)
	if err != nil {
		t.Fatalf("ListMBTITypes error: %v", err)
	}
	if len(types) != 16 {
		t.Errorf("expected 16 MBTI types, got %d", len(types))
	}
}

// UT-REPO-011: Pagination
func TestRepo_List_Pagination(t *testing.T) {
	repo := setupTestDB(t)
	ctx := context.Background()

	page1, total, err := repo.List(ctx, model.JourneyFilter{Limit: 2, Page: 1})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if len(page1) != 2 {
		t.Errorf("expected 2 journeys on page 1, got %d", len(page1))
	}

	page2, _, err := repo.List(ctx, model.JourneyFilter{Limit: 2, Page: 2})
	if err != nil {
		t.Fatalf("List error: %v", err)
	}
	if len(page2) != 2 {
		t.Errorf("expected 2 journeys on page 2, got %d", len(page2))
	}

	if total != 5 {
		t.Errorf("expected total=5, got %d", total)
	}
}
