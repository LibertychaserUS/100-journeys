package compose

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/repository"
	_ "modernc.org/sqlite"
)

// UT-COMPOSE-001: the embedded fragments pass structure, vocabulary and show-don't-tell checks.
func TestFragments_AreValid(t *testing.T) {
	fragments, err := Load()
	if err != nil {
		t.Fatalf("load fragments: %v", err)
	}
	for _, problem := range Validate(fragments) {
		t.Error(problem)
	}
	perGroup := map[string]int{}
	for _, f := range fragments {
		perGroup[f.Group]++
	}
	for _, g := range Groups {
		if perGroup[g] < 3 {
			t.Errorf("group %s needs at least 3 slips, has %d", g, perGroup[g])
		}
	}
}

// UT-COMPOSE-002: every place that links to an entrance links to a journey that exists after seed + content sync.
func TestFragments_PlaceSlugsExist(t *testing.T) {
	root, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := repository.Migrate(db, filepath.Join(root, "db/schema.sql")); err != nil {
		t.Fatal(err)
	}
	if err := repository.Seed(db, filepath.Join(root, "db/seed.sql")); err != nil {
		t.Fatal(err)
	}
	if err := content.Sync(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	fragments, _ := Load()
	linked := 0
	for _, f := range fragments {
		if f.Slug == "" {
			continue
		}
		linked++
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM journeys WHERE slug = ?`, f.Slug).Scan(&n); err != nil || n != 1 {
			t.Errorf("place %s links to unknown journey %q", f.Key, f.Slug)
		}
	}
	if linked == 0 {
		t.Error("expected at least one place to link to an entrance")
	}
}

// UT-COMPOSE-003: Validate catches duplicates, missing languages, unknown vocabulary and telling copy.
func TestValidate_Catches(t *testing.T) {
	good := Fragment{Group: "hour", Key: "dawn", ZH: Text{Text: "第一缕光"}, EN: Text{Text: "First light"}}
	if got := Validate([]Fragment{good}); len(got) != 0 {
		t.Fatalf("valid fragment reported problems: %v", got)
	}
	bad := []Fragment{
		good,
		good, // duplicate key in the same group
		{Group: "hour", Key: "teatime", ZH: Text{Text: "下午茶"}, EN: Text{Text: "Teatime"}},
		{Group: "season", Key: "rainy", ZH: Text{Text: "雨季"}},
		{Group: "weather", Key: "fog", ZH: Text{Text: "雾"}, EN: Text{Text: "Fog"}},
		{Group: "ritual", Key: "Bad Key", ZH: Text{Text: "因为你是 INFP，所以安静"}, EN: Text{Text: "As an introvert, sit still"}},
		{Group: "keepsake", Key: "pebble", Slug: "bolivia-salt-flat-trek", Realm: "nowhere", ZH: Text{Text: "一颗石子"}, EN: Text{Text: "A pebble"}},
	}
	problems := strings.Join(Validate(bad), "\n")
	for _, want := range []string{"duplicate", "teatime", "en.text", "weather", "Bad Key", "INFP", "因为你是", "introvert", "realm", "slug"} {
		if !strings.Contains(problems, want) {
			t.Errorf("expected a problem mentioning %q, got:\n%s", want, problems)
		}
	}
}

// UT-COMPOSE-004: Localize picks the language, falls back to the slip text for the sentence phrase, and Set knows the keys.
func TestLocalize_AndSet(t *testing.T) {
	f := Fragment{Group: "season", Key: "rainy", Realm: "mirror-salt", ZH: Text{Text: "雨季", Sub: "水"}, EN: Text{Text: "Rainy season", Phrase: "in the rainy season"}}
	zh := f.Localize("zh")
	if zh.Text != "雨季" || zh.Phrase != "雨季" || zh.Sub != "水" || zh.Realm != "mirror-salt" {
		t.Errorf("zh localize: %+v", zh)
	}
	if en := f.Localize("en-US"); en.Text != "Rainy season" || en.Phrase != "in the rainy season" {
		t.Errorf("en localize: %+v", en)
	}
	set := NewSet([]Fragment{f})
	if !set.Has("season", "rainy") || set.Has("hour", "rainy") || set.Has("season", "dry") {
		t.Error("Set.Has gives wrong answers")
	}
}
