package road

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/model"
)

//go:embed curated.json
var rawCurated []byte

// CuratedTicket is one of the station's own tickets: pieced from real entrance slips and shipped
// as content, so the station is never empty. It lives in no table and belongs to no account, so
// it counts towards nobody's tickets, lamps or caps; travellers can still turn it over, light it
// and set out from it. Codes contain a 0 or a 1, which share codes never do.
type CuratedTicket struct {
	Code       string
	Picks      model.CompositionPicks
	Tags       []string
	PostedAt   time.Time
	Realm      string
	Marks      map[string]int
	Doors      []string // entrance slugs, by number
	Transfer   bool
	SearchText string
}

type curatedFile struct {
	Code  string                 `json:"code"`
	Day   string                 `json:"day"`
	Tags  []string               `json:"tags"`
	Picks model.CompositionPicks `json:"picks"`
}

var curatedCode = regexp.MustCompile(`^[a-z0-9]{12}$`)

func (c *Catalog) loadCurated() {
	c.curatedByCode = map[string]int{}
	var files []curatedFile
	dec := json.NewDecoder(strings.NewReader(string(rawCurated)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&files); err != nil {
		c.curatedProblems = []string{fmt.Sprintf("curated.json: %v", err)}
		return
	}
	add := func(format string, a ...interface{}) {
		c.curatedProblems = append(c.curatedProblems, fmt.Sprintf(format, a...))
	}
	realms := map[string]bool{}
	for _, f := range files {
		if !curatedCode.MatchString(f.Code) || !strings.ContainsAny(f.Code, "01") {
			add("curated %q: code must be 12 lowercase letters or digits and contain a 0 or a 1", f.Code)
			continue
		}
		if _, dup := c.curatedByCode[f.Code]; dup {
			add("curated %q: duplicate code", f.Code)
			continue
		}
		day, err := time.Parse("2006-01-02", f.Day)
		if err != nil {
			add("curated %s: day must be YYYY-MM-DD", f.Code)
			continue
		}
		picked := 0
		rubbedAt := map[string]string{}
		var placeSlug string
		if p, ok := c.Slip("place", f.Picks.Place); ok && p.EntranceNo > 0 {
			placeSlug = c.byNo[p.EntranceNo].Slug
		}
		for group, key := range f.Picks.ByGroup() {
			if key == "" {
				continue
			}
			s, ok := c.Slip(group, key)
			if !ok {
				add("curated %s: unknown slip %s:%s", f.Code, group, key)
				continue
			}
			picked++
			// An hour or a season is postmarked with the place's own door when it opens then,
			// otherwise with the first door that does.
			if (group == "hour" || group == "season") && len(s.Doors) > 0 {
				slug := c.byNo[s.Doors[0]].Slug
				if e, ok := c.doors[placeSlug]; ok && containsInt(s.Doors, e.Entrance.No) {
					slug = placeSlug
				}
				rubbedAt[s.ID()] = slug
			}
		}
		if picked < 3 {
			add("curated %s: a ticket on the station needs at least three slips, has %d", f.Code, picked)
		}
		if len(f.Tags) > MaxTags {
			add("curated %s: at most %d tags", f.Code, MaxTags)
		}
		for _, t := range f.Tags {
			if _, ok := c.Vocab.Tag(t); !ok {
				add("curated %s: unknown tag %q", f.Code, t)
			}
		}
		marks := c.Stamp(f.Picks, rubbedAt)
		doors := c.Doors(marks)
		slugs := make([]string, len(doors))
		for i, d := range doors {
			slugs[i] = d.Slug
		}
		t := CuratedTicket{Code: f.Code, Picks: f.Picks, Tags: f.Tags, PostedAt: day.Add(12 * time.Hour), Realm: c.Realm(f.Picks),
			Marks: marks, Doors: slugs, Transfer: len(doors) >= 2, SearchText: c.SearchText(f.Picks, f.Tags)}
		realms[t.Realm] = true
		c.curatedByCode[t.Code] = len(c.curated)
		c.curated = append(c.curated, t)
	}
	for _, r := range content.Realms {
		if !realms[r] {
			add("curated tickets need at least one on every platform; none for %s", r)
		}
	}
	if n := len(c.curated); n < 8 || n > 16 {
		add("the station hangs 8 to 16 tickets of its own, has %d", n)
	}
	sort.SliceStable(c.curated, func(i, j int) bool { return c.curated[i].Code < c.curated[j].Code })
	for i, t := range c.curated {
		c.curatedByCode[t.Code] = i
	}
}

// Curated lists the station's own tickets.
func (c *Catalog) Curated() []CuratedTicket { return c.curated }

// CuratedTicket returns one of the station's own tickets by code.
func (c *Catalog) CuratedTicket(code string) (CuratedTicket, bool) {
	i, ok := c.curatedByCode[code]
	if !ok {
		return CuratedTicket{}, false
	}
	return c.curated[i], true
}

// ValidateCurated returns readable problems with curated.json; empty means it can ship.
func (c *Catalog) ValidateCurated() []string { return c.curatedProblems }

// CuratedAlias is how the station signs its own tickets.
func CuratedAlias(lang string) string {
	if strings.HasPrefix(strings.ToLower(lang), "en") {
		return "The Night Station"
	}
	return "夜站"
}

// WrittenFor reports whether door slug was written with type code in mind (content affinity of 4
// or more). Only doors are matched, never authors.
func (c *Catalog) WrittenFor(slug, code string) bool {
	e, ok := c.doors[slug]
	return ok && e.Journey.MBTI[code] >= 4
}
