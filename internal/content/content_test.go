package content

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/100-journeys/app/internal/repository"
	_ "modernc.org/sqlite"
)

// UT-CONTENT-001: every embedded entrance passes structure and show-don't-tell checks.
func TestEntrances_AreValid(t *testing.T) {
	entrances, err := Load()
	if err != nil {
		t.Fatalf("load entrances: %v", err)
	}
	if len(entrances) == 0 {
		t.Fatal("expected at least one entrance")
	}
	seenNo := map[int]string{}
	for _, e := range entrances {
		for _, problem := range Validate(e) {
			t.Errorf("%s: %s", e.Slug, problem)
		}
		if other, ok := seenNo[e.Entrance.No]; ok {
			t.Errorf("%s: entrance number %d already used by %s", e.Slug, e.Entrance.No, other)
		}
		seenNo[e.Entrance.No] = e.Slug
	}
}

// UT-CONTENT-004: every cover exists under web/assets/images and slugs are unique.
func TestEntrances_CoversExist(t *testing.T) {
	entrances, err := Load()
	if err != nil {
		t.Fatalf("load entrances: %v", err)
	}
	root, _ := filepath.Abs("../..")
	seen := map[string]bool{}
	for _, e := range entrances {
		if seen[e.Slug] {
			t.Errorf("duplicate slug %s", e.Slug)
		}
		seen[e.Slug] = true
		if _, err := os.Stat(filepath.Join(root, "web/assets/images", e.Cover.Path)); err != nil {
			t.Errorf("%s: cover %s not found", e.Slug, e.Cover.Path)
		}
	}
}

// UT-CONTENT-002: the lint catches telling instead of showing.
func TestValidate_FlagsTelling(t *testing.T) {
	e := validSample()
	e.ZH.Chapters[0].Paragraphs = []string{"因为你是 INFP，所以你会喜欢这里的安静。"}
	e.EN.Ending = "As an introvert, you will love it."
	problems := strings.Join(Validate(e), "\n")
	for _, want := range []string{"INFP", "因为你是", "introvert"} {
		if !strings.Contains(problems, want) {
			t.Errorf("expected a problem mentioning %q, got:\n%s", want, problems)
		}
	}
}

// UT-CONTENT-003: structural rules (choice keys match across languages, facts carry sources).
func TestValidate_Structure(t *testing.T) {
	e := validSample()
	e.EN.Choice.Options[0].Key = "different"
	e.ZH.Facts[0].Source = "not-a-url"
	e.Entrance.Realm = "nowhere"
	e.Entrance.Seasons = []string{"monsoon"}
	e.Journey.Tags = []string{"beach"}
	problems := strings.Join(Validate(e), "\n")
	for _, want := range []string{"choice keys", "source", "realm", "season", "tag"} {
		if !strings.Contains(problems, want) {
			t.Errorf("expected a problem mentioning %q, got:\n%s", want, problems)
		}
	}
	if got := Validate(validSample()); len(got) != 0 {
		t.Errorf("valid sample reported problems: %v", got)
	}
}

// IT-CONTENT-001: Sync writes base rows, translations, entrance metadata and structured content, idempotently.
func TestSync_WritesEverything(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if err := Sync(ctx, db); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if err := Sync(ctx, db); err != nil { // second run is a no-op
		t.Fatalf("second sync: %v", err)
	}
	entrances, _ := Load()
	e := entrances[0]

	var title, imagePath string
	if err := db.QueryRowContext(ctx, `SELECT title, image_path FROM journeys WHERE slug = ?`, e.Slug).Scan(&title, &imagePath); err != nil {
		t.Fatalf("journey row: %v", err)
	}
	if title != e.ZH.Title || imagePath != e.Cover.Path {
		t.Errorf("journey row not synced: %q %q", title, imagePath)
	}
	var enTitle string
	if err := db.QueryRowContext(ctx, `SELECT tr.title FROM journey_translations tr JOIN journeys j ON j.id = tr.journey_id WHERE j.slug = ? AND tr.locale = 'en'`, e.Slug).Scan(&enTitle); err != nil || enTitle != e.EN.Title {
		t.Errorf("english translation not synced: %q %v", enTitle, err)
	}
	var no int
	if err := db.QueryRowContext(ctx, `SELECT en.no FROM journey_entrances en JOIN journeys j ON j.id = en.journey_id WHERE j.slug = ?`, e.Slug).Scan(&no); err != nil || no != e.Entrance.No {
		t.Errorf("entrance metadata not synced: %d %v", no, err)
	}
	var locales int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM journey_content c JOIN journeys j ON j.id = c.journey_id WHERE j.slug = ?`, e.Slug).Scan(&locales); err != nil || locales != 2 {
		t.Errorf("expected zh + en content rows, got %d %v", locales, err)
	}
	var mbti int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM journey_mbti jm JOIN journeys j ON j.id = jm.journey_id WHERE j.slug = ?`, e.Slug).Scan(&mbti); err != nil || mbti != len(e.Journey.MBTI) {
		t.Errorf("expected %d mbti rows, got %d %v", len(e.Journey.MBTI), mbti, err)
	}
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	root, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := repository.Migrate(db, filepath.Join(root, "db/schema.sql")); err != nil {
		t.Fatal(err)
	}
	if err := repository.Seed(db, filepath.Join(root, "db/seed.sql")); err != nil {
		t.Fatal(err)
	}
	return db
}

func validSample() Entrance {
	text := func(s string) Text {
		return Text{
			Title: s + " title", Subtitle: s + " subtitle", Hook: s + " hook", Region: "Region", Moods: []string{"quiet", "wide"},
			Opens: "at dawn", Role: "the finder", Premise: "A real place.", Mission: "Find the line.",
			Chapters: []Chapter{{Title: "One", Paragraphs: []string{"You walk."}}, {Title: "Two", Paragraphs: []string{"You stop."}}},
			Choice:   &Choice{Prompt: "Pick one", Options: []Option{{Key: "a", Label: "A", Keeps: "a stone"}, {Key: "b", Label: "B", Keeps: "a word"}}},
			Ending:   "You go home.",
			Facts:    []Fact{{Text: "Fact one.", Source: "https://example.org/1"}, {Text: "Fact two.", Source: "https://example.org/2"}},
			Fiction:  "The entrance is fiction.",
		}
	}
	return Entrance{
		Slug:     "sample",
		Entrance: Meta{No: 99, Realm: "mirror-salt", Pace: "day", Scale: "far", Seasons: []string{"rainy"}, Time: "predawn"},
		Journey:  Base{FantasyType: "solitude", VisualStyle: "surreal", Adventure: 4, Obscurity: 7, Risk: 2, Price: 100, Tags: []string{"solitude"}, MBTI: map[string]int{"INFP": 5, "INFJ": 4}},
		Cover:    Cover{Path: "generated/card-salt-mirror.jpg", License: "self-generated", Source: "recorded in docs/content/IMAGE_SOURCES.md"},
		ZH:       text("zh"),
		EN:       text("en"),
	}
}

// IT-CONTENT-002: a restart (seed again, then sync) keeps the authored content, not the seed copy.
func TestSync_SurvivesReseed(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	root, _ := filepath.Abs("../..")
	for i := 0; i < 2; i++ { // first start, then a restart on the same database
		if i > 0 {
			if err := repository.Seed(db, filepath.Join(root, "db/seed.sql")); err != nil {
				t.Fatal(err)
			}
		}
		if err := Sync(ctx, db); err != nil {
			t.Fatalf("sync %d: %v", i, err)
		}
	}
	entrances, _ := Load()
	for _, e := range entrances {
		var title, enTitle, cover string
		if err := db.QueryRowContext(ctx, `
			SELECT j.title, tr.title, j.image_path FROM journeys j
			JOIN journey_translations tr ON tr.journey_id = j.id AND tr.locale = 'en' WHERE j.slug = ?`, e.Slug).Scan(&title, &enTitle, &cover); err != nil {
			t.Fatal(err)
		}
		if title != e.ZH.Title || enTitle != e.EN.Title || cover != e.Cover.Path {
			t.Errorf("%s reverted after restart: %q / %q / %q", e.Slug, title, enTitle, cover)
		}
		var mbti int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM journey_mbti jm JOIN journeys j ON j.id = jm.journey_id WHERE j.slug = ?`, e.Slug).Scan(&mbti); err != nil || mbti != len(e.Journey.MBTI) {
			t.Errorf("%s has %d MBTI rows after restart, want %d", e.Slug, mbti, len(e.Journey.MBTI))
		}
		var tags int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM journey_tags jt JOIN journeys j ON j.id = jt.journey_id WHERE j.slug = ?`, e.Slug).Scan(&tags); err != nil || tags != len(e.Journey.Tags) {
			t.Errorf("%s has %d tags after restart, want %d", e.Slug, tags, len(e.Journey.Tags))
		}
	}
}
