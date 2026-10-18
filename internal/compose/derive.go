package compose

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/100-journeys/app/internal/content"
)

// How a traveller comes to hold a slip (Fragment.Unlock). Slips are rubbed at the end of the
// doors they belong to; ownership only shapes the tray, the server never trusts it.
const (
	UnlockStarter = "starter" // near slips everyone holds from the first visit
	UnlockOpen    = "open"    // slips no door hands out: how long you stay, small rituals, plain keepsakes
	UnlockFinish  = "finish"  // a door's place, hour and season, rubbed at its end
	UnlockFork    = "fork:"   // + option key: what you took from one side of a door's fork
)

// Door is the entrance a slip can be rubbed from, as the tray's outlines point to it.
type Door struct {
	No      int    `json:"no"`
	Slug    string `json:"slug"`
	Realm   string `json:"realm"`
	Opens   string `json:"opens"`
	Role    string `json:"role"`
	opensZH string
	opensEN string
	roleZH  string
	roleEN  string
}

func (d Door) localize(lang string) *Door {
	out := d
	out.Opens, out.Role = d.opensZH, d.roleZH
	if strings.HasPrefix(strings.ToLower(lang), "en") {
		out.Opens, out.Role = d.opensEN, d.roleEN
	}
	return &out
}

// Derived slips may be longer than hand-written ones: a keepsake is the fork's own words.
const (
	maxDerivedZH = 24
	maxDerivedEN = 64
)

// Build merges the hand-written slips with the ones every entrance hands out: its place (when
// fragments.json has none for it), and one keepsake per fork option, keyed keep-<no>-<option>.
// Hour and season slips record the doors whose opening time they are. The result is ordered for
// the tray and is never mutated afterwards.
func Build(static []Fragment, entrances []content.Entrance) []Fragment {
	doors := map[int]*Door{}
	for _, e := range entrances {
		doors[e.Entrance.No] = &Door{No: e.Entrance.No, Slug: e.Slug, Realm: e.Entrance.Realm,
			opensZH: e.ZH.Opens, opensEN: e.EN.Opens, roleZH: e.ZH.Role, roleEN: e.EN.Role}
	}
	out := make([]Fragment, 0, len(static)+len(entrances)*4)
	placeBySlug := map[string]int{}
	for _, f := range static {
		f.Doors = nil
		out = append(out, f)
		if f.Group == "place" && f.Slug != "" {
			placeBySlug[f.Slug] = len(out) - 1
		}
	}
	vocabDoors := map[string][]int{} // "hour:predawn" -> entrance numbers
	for _, e := range entrances {
		no := e.Entrance.No
		if i, ok := placeBySlug[e.Slug]; ok {
			out[i].Doors = []int{no}
			if out[i].Realm == "" {
				out[i].Realm = e.Entrance.Realm
			}
		} else {
			zh, en := placeName(e.ZH.Title), placeName(e.EN.Title)
			out = append(out, Fragment{Group: "place", Key: e.Slug, Slug: e.Slug, Realm: e.Entrance.Realm, Doors: []int{no}, Derived: true,
				ZH: Text{Text: zh, Sub: e.ZH.Region, Phrase: zh},
				EN: Text{Text: upperFirst(en), Sub: e.EN.Region, Phrase: en}})
		}
		if e.Entrance.Time != "" && e.Entrance.Time != "any" {
			vocabDoors["hour:"+e.Entrance.Time] = append(vocabDoors["hour:"+e.Entrance.Time], no)
		}
		for _, s := range e.Entrance.Seasons {
			if s != "any" {
				vocabDoors["season:"+s] = append(vocabDoors["season:"+s], no)
			}
		}
		if e.ZH.Choice == nil || e.EN.Choice == nil {
			continue
		}
		for i, o := range e.ZH.Choice.Options {
			if i >= len(e.EN.Choice.Options) {
				break
			}
			en := e.EN.Choice.Options[i]
			out = append(out, Fragment{Group: "keepsake", Key: KeepsakeKey(no, o.Key), Realm: e.Entrance.Realm, Doors: []int{no}, Derived: true,
				Unlock: UnlockFork + o.Key,
				ZH:     Text{Text: o.Keeps, Phrase: o.Keeps},
				EN:     Text{Text: en.Keeps, Phrase: lowerFirst(en.Keeps)}})
		}
	}
	for i := range out {
		f := &out[i]
		if d, ok := vocabDoors[f.Group+":"+f.Key]; ok && (f.Group == "hour" || f.Group == "season") {
			f.Doors = d
		}
		switch {
		case f.Unlock != "":
		case f.Group == "place" && len(f.Doors) == 0:
			f.Unlock = UnlockStarter
		case len(f.Doors) > 0 && (f.Group == "place" || f.Group == "hour" || f.Group == "season"):
			f.Unlock = UnlockFinish
		default:
			f.Unlock = UnlockOpen
		}
		if len(f.Doors) > 0 {
			if d := doors[f.Doors[0]]; d != nil {
				f.door = d
			}
		}
		// A place or a keepsake belongs to one door; an hour or a season is postmarked with
		// whichever of its doors the traveller rubbed it at.
		if (f.Group == "place" || f.Group == "keepsake") && len(f.Doors) == 1 {
			f.EntranceNo = f.Doors[0]
		}
	}
	sortForTray(out)
	return out
}

// KeepsakeKey is the slip key of what one fork option leaves you with.
func KeepsakeKey(no int, option string) string { return fmt.Sprintf("keep-%d-%s", no, option) }

// sortForTray: places by door (near slips last), hours and seasons in vocabulary order,
// keepsakes hand-written first and then by door; stays and rituals as written.
func sortForTray(list []Fragment) {
	rank := func(f Fragment) int {
		switch f.Group {
		case "hour":
			return index(content.Times, f.Key)
		case "season":
			return index(content.Seasons, f.Key)
		case "place":
			if f.Unlock == UnlockStarter {
				return 1000
			}
			if len(f.Doors) > 0 {
				return f.Doors[0]
			}
			return 999
		case "keepsake":
			if f.Derived && len(f.Doors) > 0 {
				return f.Doors[0]
			}
			return 0
		}
		return 0
	}
	group := func(g string) int { return index(Groups, g) }
	sort.SliceStable(list, func(i, j int) bool {
		gi, gj := group(list[i].Group), group(list[j].Group)
		if gi != gj {
			return gi < gj
		}
		return rank(list[i]) < rank(list[j])
	})
}

func index(list []string, v string) int {
	for i, x := range list {
		if x == v {
			return i
		}
	}
	return len(list)
}

// placeName is the place half of an entrance title ("镜面 · 乌尤尼盐沼" → "乌尤尼盐沼").
func placeName(title string) string {
	parts := strings.Split(title, " · ")
	return strings.TrimSpace(parts[len(parts)-1])
}

func upperFirst(s string) string {
	r, n := utf8.DecodeRuneInString(s)
	if r == utf8.RuneError || !unicode.IsLower(r) {
		return s
	}
	return string(unicode.ToUpper(r)) + s[n:]
}

// lowerFirst lets an English keepsake sit inside the ticket sentence ("…come home with a postcard").
func lowerFirst(s string) string {
	r, n := utf8.DecodeRuneInString(s)
	if r == utf8.RuneError || !unicode.IsUpper(r) {
		return s
	}
	if len(s) > n {
		if next, _ := utf8.DecodeRuneInString(s[n:]); unicode.IsUpper(next) { // an acronym stays as written
			return s
		}
	}
	return string(unicode.ToLower(r)) + s[n:]
}
