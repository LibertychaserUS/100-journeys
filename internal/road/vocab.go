// Package road holds the rules of the Ticket Road (票路): the printed tags, the stamps and
// flags of a lamp, report reasons, how lamps add up, and how an author is named on a ticket.
//
// Everything a traveller can put on a ticket or a lamp is a key from these embedded lists, so
// nothing public needs review: the vocabulary is the moderation. See docs/content/SCHEMA.md.
package road

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/100-journeys/app/internal/content"
)

//go:embed tags.json
var rawTags []byte

//go:embed stamps.json
var rawStamps []byte

// Tag kinds: words of the world, states of mind, things you do.
var TagKinds = []string{"world", "mood", "practice"}

// Label is a key with its two names.
type Label struct {
	Key string `json:"key"`
	ZH  string `json:"zh"`
	EN  string `json:"en"`
}

// Name returns the label in lang ("en…" for English, anything else Chinese).
func (l Label) Name(lang string) string {
	if strings.HasPrefix(strings.ToLower(lang), "en") {
		return l.EN
	}
	return l.ZH
}

// Tag is a printed luggage tag.
type Tag struct {
	Label
	Kind string `json:"kind"`
}

// Vocab is everything a ticket or a lamp can carry besides slips.
type Vocab struct {
	Tags    []Tag
	Stamps  []Label
	Flags   []Label
	Reasons []Label

	tags    map[string]Tag
	stamps  map[string]bool
	flags   map[string]bool
	reasons map[string]bool
}

// MaxTags is how many printed tags one ticket carries.
const MaxTags = 5

// LoadVocab reads the embedded lists.
func LoadVocab() (*Vocab, error) {
	v := &Vocab{}
	dec := json.NewDecoder(strings.NewReader(string(rawTags)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v.Tags); err != nil {
		return nil, fmt.Errorf("tags.json: %w", err)
	}
	var s struct {
		Stamps  []Label `json:"stamps"`
		Flags   []Label `json:"flags"`
		Reasons []Label `json:"reasons"`
	}
	dec = json.NewDecoder(strings.NewReader(string(rawStamps)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&s); err != nil {
		return nil, fmt.Errorf("stamps.json: %w", err)
	}
	v.Stamps, v.Flags, v.Reasons = s.Stamps, s.Flags, s.Reasons
	v.tags = map[string]Tag{}
	for _, t := range v.Tags {
		v.tags[t.Key] = t
	}
	set := func(list []Label) map[string]bool {
		m := map[string]bool{}
		for _, l := range list {
			m[l.Key] = true
		}
		return m
	}
	v.stamps, v.flags, v.reasons = set(v.Stamps), set(v.Flags), set(v.Reasons)
	return v, nil
}

func (v *Vocab) Tag(key string) (Tag, bool) { t, ok := v.tags[key]; return t, ok }
func (v *Vocab) HasStamp(key string) bool   { return v.stamps[key] }
func (v *Vocab) HasFlag(key string) bool    { return v.flags[key] }
func (v *Vocab) HasReason(key string) bool  { return v.reasons[key] }

var kebab = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Validate returns readable problems; an empty slice means the vocabulary can ship.
func (v *Vocab) Validate() []string {
	var p []string
	add := func(format string, a ...interface{}) { p = append(p, fmt.Sprintf(format, a...)) }
	check := func(list string, l Label, maxZH, maxEN int) {
		if !kebab.MatchString(l.Key) {
			add("%s %q: key must be kebab-case", list, l.Key)
		}
		if strings.TrimSpace(l.ZH) == "" || strings.TrimSpace(l.EN) == "" {
			add("%s %q: needs both zh and en", list, l.Key)
		}
		if n := utf8.RuneCountInString(l.ZH); n > maxZH {
			add("%s %q: zh is %d characters, at most %d", list, l.Key, n, maxZH)
		}
		if n := utf8.RuneCountInString(l.EN); n > maxEN {
			add("%s %q: en is %d characters, at most %d", list, l.Key, n, maxEN)
		}
		for _, problem := range append(content.Lint("zh", l.ZH), content.Lint("en", l.EN)...) {
			add("%s %q: %s", list, l.Key, problem)
		}
	}
	seen := map[string]bool{}
	kinds := map[string]int{}
	for _, t := range v.Tags {
		check("tag", t.Label, 6, 16)
		if seen["tag:"+t.Key] {
			add("tag %q: duplicate key", t.Key)
		}
		seen["tag:"+t.Key] = true
		if !content.Contains(TagKinds, t.Kind) {
			add("tag %q: unknown kind %q", t.Key, t.Kind)
		}
		kinds[t.Kind]++
	}
	for _, k := range TagKinds {
		if kinds[k] < 8 {
			add("tag kind %s needs at least 8 tags, has %d", k, kinds[k])
		}
	}
	for name, list := range map[string][]Label{"stamp": v.Stamps, "flag": v.Flags, "reason": v.Reasons} {
		for _, l := range list {
			check(name, l, 8, 24)
			if seen[name+":"+l.Key] {
				add("%s %q: duplicate key", name, l.Key)
			}
			seen[name+":"+l.Key] = true
		}
	}
	if len(v.Stamps) != 8 {
		add("a lamp offers 8 stamps, found %d", len(v.Stamps))
	}
	return p
}
