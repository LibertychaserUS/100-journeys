package compose

import (
	"strings"
	"testing"

	"github.com/100-journeys/app/internal/content"
)

func built(t *testing.T) []Fragment {
	t.Helper()
	static, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	entrances, err := content.Load()
	if err != nil {
		t.Fatal(err)
	}
	return Build(static, entrances)
}

// UT-COMPOSE-005: every entrance hands out its place and one keepsake per fork option, and the
// merged set still passes the slip checks.
func TestBuild_DerivesSlipsFromEveryEntrance(t *testing.T) {
	list := built(t)
	for _, p := range Validate(list) {
		t.Error(p)
	}
	entrances, _ := content.Load()
	by := map[string]Fragment{}
	for _, f := range list {
		by[f.ID()] = f
	}
	for _, e := range entrances {
		place := false
		for _, f := range list {
			if f.Group == "place" && f.EntranceNo == e.Entrance.No {
				place = true
			}
		}
		if !place {
			t.Errorf("entrance %d has no place slip", e.Entrance.No)
		}
		for _, o := range e.ZH.Choice.Options {
			f, ok := by["keepsake:"+KeepsakeKey(e.Entrance.No, o.Key)]
			if !ok {
				t.Errorf("entrance %d option %s has no keepsake slip", e.Entrance.No, o.Key)
				continue
			}
			if f.Unlock != UnlockFork+o.Key || f.ZH.Text != o.Keeps {
				t.Errorf("keepsake %s: unlock %q text %q", f.Key, f.Unlock, f.ZH.Text)
			}
		}
	}
	if f := by["place:uyuni"]; f.EntranceNo != 1 || f.Unlock != UnlockFinish {
		t.Errorf("the hand-written Uyuni slip should belong to door 1, got %d %q", f.EntranceNo, f.Unlock)
	}
	if f := by["place:back-alley"]; f.Unlock != UnlockStarter {
		t.Errorf("near places are starter slips, got %q", f.Unlock)
	}
	if f := by["hour:predawn"]; f.Unlock != UnlockFinish || len(f.Doors) < 2 || f.EntranceNo != 0 {
		t.Errorf("predawn is rubbed at several doors: %+v", f.Doors)
	}
	if f := by["season:midnight-sun"]; f.Unlock != UnlockOpen {
		t.Errorf("a season no door opens in stays open, got %q", f.Unlock)
	}
	if f := by["keepsake:keep-1-postcard"]; f.EN.Phrase != "a postcard never sent" {
		t.Errorf("English keepsake phrase should sit inside a sentence, got %q", f.EN.Phrase)
	}
}

// UT-COMPOSE-006: the tray order keeps groups together, places by door and near places last.
func TestBuild_TrayOrder(t *testing.T) {
	list := built(t)
	last := -1
	for _, f := range list {
		g := index(Groups, f.Group)
		if g < last {
			t.Fatalf("group %s appears after a later group", f.Group)
		}
		last = g
	}
	var places []Fragment
	for _, f := range list {
		if f.Group == "place" {
			places = append(places, f)
		}
	}
	if places[0].EntranceNo != 1 || places[len(places)-1].Unlock != UnlockStarter {
		t.Errorf("places should start at door 1 and end with the near ones: %s … %s", places[0].Key, places[len(places)-1].Key)
	}
	l := list[0].Localize("en")
	if l.Door == nil || l.Door.No != 1 || !strings.Contains(l.Door.Opens, "rainy") {
		t.Errorf("localized door: %+v", l.Door)
	}
}
