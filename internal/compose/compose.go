// Package compose holds the paper slips of the compose game ("画一个自己的入口"): short bilingual
// fragments in six groups that a visitor pieces together into a ticket of their own.
//
// The slips are compiled into the binary (fragments.json). hour, season and stay use the world
// vocabulary of internal/content (Times, Seasons, Paces) as keys; a place may link to an entrance
// slug. Keys are stored with kept tickets, so never rename one. See docs/content/SCHEMA.md.
package compose

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/100-journeys/app/internal/content"
)

//go:embed fragments.json
var raw []byte

// Groups in the order the tray and the ticket show them.
var Groups = []string{"place", "hour", "season", "stay", "ritual", "keepsake"}

// vocabulary maps groups whose keys come from the world vocabulary.
var vocabulary = map[string][]string{"hour": content.Times, "season": content.Seasons, "stay": content.Paces}

// Fragment is one slip.
type Fragment struct {
	Group string `json:"group"`
	Key   string `json:"key"`
	Slug  string `json:"slug,omitempty"`  // place only: the entrance this place opens
	Realm string `json:"realm,omitempty"` // optional, used to suggest slips that belong together
	ZH    Text   `json:"zh"`
	EN    Text   `json:"en"`
}

// Text is the copy of a slip in one language.
type Text struct {
	Text   string `json:"text"`             // what the slip says
	Sub    string `json:"sub,omitempty"`    // small second line
	Phrase string `json:"phrase,omitempty"` // how it reads inside the ticket sentence; defaults to Text
}

// Localized is a slip in the requested language, as the API returns it.
type Localized struct {
	Group    string `json:"group"`
	Key      string `json:"key"`
	Text     string `json:"text"`
	Sub      string `json:"sub,omitempty"`
	Phrase   string `json:"phrase"`
	Realm    string `json:"realm,omitempty"`
	Slug     string `json:"slug,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}

// Load reads the embedded slips in file order.
func Load() ([]Fragment, error) {
	var out []Fragment
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&out); err != nil {
		return nil, fmt.Errorf("fragments.json: %w", err)
	}
	return out, nil
}

var kebab = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Validate returns human-readable problems; an empty slice means the slips can ship.
func Validate(fragments []Fragment) []string {
	var p []string
	add := func(format string, a ...interface{}) { p = append(p, fmt.Sprintf(format, a...)) }
	seen := map[string]bool{}
	for _, f := range fragments {
		id := f.Group + ":" + f.Key
		if !content.Contains(Groups, f.Group) {
			add("%s: unknown group %q", id, f.Group)
		}
		if !kebab.MatchString(f.Key) {
			add("%s: key must be kebab-case", id)
		}
		if seen[id] {
			add("%s: duplicate key", id)
		}
		seen[id] = true
		if vocab, ok := vocabulary[f.Group]; ok && !content.Contains(vocab, f.Key) {
			add("%s: %s slips use the world vocabulary as keys, %q is not in it", id, f.Group, f.Key)
		}
		if f.Realm != "" && !content.Contains(content.Realms, f.Realm) {
			add("%s: unknown realm %q", id, f.Realm)
		}
		if f.Slug != "" && (f.Group != "place" || !kebab.MatchString(f.Slug)) {
			add("%s: only places link to an entrance slug", id)
		}
		for _, lang := range []struct {
			name string
			t    Text
			max  int
		}{{"zh", f.ZH, 14}, {"en", f.EN, 40}} {
			if strings.TrimSpace(lang.t.Text) == "" {
				add("%s: %s.text is required", id, lang.name)
				continue
			}
			if n := utf8.RuneCountInString(lang.t.Text); n > lang.max {
				add("%s: %s.text is %d characters, a slip holds %d", id, lang.name, n, lang.max)
			}
			for _, s := range []string{lang.t.Text, lang.t.Sub, lang.t.Phrase} {
				for _, problem := range content.Lint(lang.name, s) {
					add("%s: %s", id, problem)
				}
			}
		}
	}
	return p
}

// Localize returns the slip in lang ("en…" for English, anything else Chinese).
func (f Fragment) Localize(lang string) Localized {
	t := f.ZH
	if strings.HasPrefix(strings.ToLower(lang), "en") {
		t = f.EN
	}
	phrase := t.Phrase
	if phrase == "" {
		phrase = t.Text
	}
	return Localized{Group: f.Group, Key: f.Key, Text: t.Text, Sub: t.Sub, Phrase: phrase, Realm: f.Realm, Slug: f.Slug}
}

// Set answers whether a group has a key, for validating kept tickets.
type Set map[string]map[string]bool

func NewSet(fragments []Fragment) Set {
	s := Set{}
	for _, f := range fragments {
		if s[f.Group] == nil {
			s[f.Group] = map[string]bool{}
		}
		s[f.Group][f.Key] = true
	}
	return s
}

func (s Set) Has(group, key string) bool { return s[group][key] }
