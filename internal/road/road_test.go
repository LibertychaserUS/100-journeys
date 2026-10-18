package road

import (
	"testing"
	"time"

	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/road/light"
)

func catalog(t *testing.T) *Catalog {
	t.Helper()
	static, err := compose.Load()
	if err != nil {
		t.Fatal(err)
	}
	entrances, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	v, err := LoadVocab()
	if err != nil {
		t.Fatal(err)
	}
	return NewCatalog(compose.Build(static, entrances), entrances, v, []byte("test-key"))
}

// UT-ROAD-001: printed tags, stamps, flags and reasons are bilingual, short and pass the lint.
func TestVocab_IsValid(t *testing.T) {
	v, err := LoadVocab()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range v.Validate() {
		t.Error(p)
	}
	if n := len(v.Tags); n < 36 || n > 44 {
		t.Errorf("about 40 printed tags expected, have %d", n)
	}
	if !v.HasStamp("stopped") || !v.HasFlag("facts") || !v.HasReason("wrong") {
		t.Error("lookups fail")
	}
}

// UT-ROAD-003: the end of a door hands out its place, hour, seasons and the picked keepsake;
// a ticket's lines are postmarked with the doors they came from.
func TestCatalog_RubbingsAndPostmarks(t *testing.T) {
	c := catalog(t)
	e, ok := c.Door("bolivia-salt-flat-trek")
	if !ok {
		t.Fatal("door 1 missing")
	}
	var ids []string
	for _, f := range c.Rubbed(e, "postcard") {
		ids = append(ids, f.ID())
	}
	want := []string{"place:uyuni", "hour:predawn", "season:rainy", "keepsake:keep-1-postcard"}
	if len(ids) != len(want) {
		t.Fatalf("rubbed %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Errorf("rubbed[%d] = %s, want %s", i, ids[i], want[i])
		}
	}
	if !c.CanRubAt("hour:predawn", "japan-onsen-temple-meditation") || c.CanRubAt("hour:predawn", "norway-aurora-hunt") {
		t.Error("predawn is rubbed at door 3, not at door 6")
	}
	picks := model.CompositionPicks{Place: "uyuni", Hour: "predawn", Keepsake: "keep-6-pencil", Stay: "day"}
	marks := c.Stamp(picks, map[string]string{"hour:predawn": "japan-onsen-temple-meditation"})
	if marks["place"] != 1 || marks["hour"] != 3 || marks["keepsake"] != 6 || marks["stay"] != 0 {
		t.Errorf("postmarks %v", marks)
	}
	if n := len(c.Doors(marks)); n != 3 {
		t.Errorf("three doors expected, got %d", n)
	}
	if got := c.Realm(picks); got != "mirror-salt" {
		t.Errorf("realm %q", got)
	}
}

// UT-ROAD-004: authors are an alias and four digits; the hash never shows the id.
func TestCatalog_Alias(t *testing.T) {
	c := catalog(t)
	h := c.AuthorHash(42)
	if len(h) != 16 || h == c.AuthorHash(43) || h != c.AuthorHash(42) {
		t.Errorf("author hash %q", h)
	}
	no := AliasNo(h)
	if got := c.Alias("bolivia-salt-flat-trek", no, "zh"); got[:len("找镜子的人")] != "找镜子的人" {
		t.Errorf("alias %q", got)
	}
	if got := c.Alias("", 7, "en"); got != "A passer-by · 0007" {
		t.Errorf("alias without a door %q", got)
	}
	zh, en := c.Reading("bolivia-salt-flat-trek")
	floor := light.Defaults().ReadingFloor(zh, en)
	if floor < 45*time.Second || floor > 5*time.Minute {
		t.Errorf("reading floor %s from %d zh chars, %d en words", floor, zh, en)
	}
}
