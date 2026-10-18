package road

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/model"
)

// Catalog is the in-memory world the Ticket Road reads: every slip, every door and the vocabulary.
// It is built once at start and never changes.
type Catalog struct {
	Vocab   *Vocab
	slips   map[string]compose.Fragment // by "group:key"
	doors   map[string]content.Entrance // by slug
	byNo    map[int]content.Entrance
	reading map[string][2]int // slug -> zh characters, en words of the story
	key     []byte            // HMAC key for author hashes
}

// NewCatalog indexes the built slips and the entrances. key keeps author hashes unlinkable to ids.
func NewCatalog(slips []compose.Fragment, entrances []content.Entrance, vocab *Vocab, key []byte) *Catalog {
	c := &Catalog{Vocab: vocab, slips: map[string]compose.Fragment{}, doors: map[string]content.Entrance{}, byNo: map[int]content.Entrance{}, reading: map[string][2]int{}, key: key}
	for _, f := range slips {
		c.slips[f.ID()] = f
	}
	for _, e := range entrances {
		c.doors[e.Slug] = e
		c.byNo[e.Entrance.No] = e
		c.reading[e.Slug] = [2]int{zhChars(e.ZH), enWords(e.EN)}
	}
	return c
}

func (c *Catalog) Slip(group, key string) (compose.Fragment, bool) {
	f, ok := c.slips[group+":"+key]
	return f, ok
}

func (c *Catalog) SlipByID(id string) (compose.Fragment, bool) { f, ok := c.slips[id]; return f, ok }

func (c *Catalog) Door(slug string) (content.Entrance, bool) { e, ok := c.doors[slug]; return e, ok }

func (c *Catalog) DoorNo(no int) (content.Entrance, bool) { e, ok := c.byNo[no]; return e, ok }

// Reading returns the story length of a door: Chinese characters and English words.
func (c *Catalog) Reading(slug string) (zh, en int) { r := c.reading[slug]; return r[0], r[1] }

// Rubbed lists the slips the end of a door hands out: its place, hour and seasons, and the
// keepsake of the fork option picked (empty option: none).
func (c *Catalog) Rubbed(e content.Entrance, option string) []compose.Fragment {
	var out []compose.Fragment
	for _, f := range c.slips {
		switch {
		case f.Group == "place" && f.EntranceNo == e.Entrance.No:
		case (f.Group == "hour" || f.Group == "season") && containsInt(f.Doors, e.Entrance.No):
		case f.Group == "keepsake" && option != "" && f.Key == compose.KeepsakeKey(e.Entrance.No, option):
		default:
			continue
		}
		out = append(out, f)
	}
	order := map[string]int{"place": 0, "hour": 1, "season": 2, "keepsake": 3}
	sort.Slice(out, func(i, j int) bool {
		if order[out[i].Group] != order[out[j].Group] {
			return order[out[i].Group] < order[out[j].Group]
		}
		return out[i].Key < out[j].Key
	})
	return out
}

// CanRubAt reports whether slip id is handed out at door slug (merging a guest's rubbings).
func (c *Catalog) CanRubAt(id, slug string) bool {
	f, ok := c.slips[id]
	e, door := c.doors[slug]
	if !ok || !door {
		return false
	}
	return containsInt(f.Doors, e.Entrance.No)
}

// AuthorHash is a stable, unlinkable handle for an account: blocks and diversity use it.
func (c *Catalog) AuthorHash(userID int64) string {
	m := hmac.New(sha256.New, c.key)
	fmt.Fprintf(m, "author:%d", userID)
	return hex.EncodeToString(m.Sum(nil))[:16]
}

// AliasNo is the author's four digits.
func AliasNo(hash string) int {
	b, err := hex.DecodeString(hash)
	if err != nil || len(b) < 4 {
		return 0
	}
	return int(binary.BigEndian.Uint32(b[:4]) % 10000)
}

// Alias names the author on a ticket: the role of a door the ticket borrowed from, and four
// digits ("找镜子的人 · 0412"). Without a door, a passer-by.
func (c *Catalog) Alias(slug string, no int, lang string) string {
	en := strings.HasPrefix(strings.ToLower(lang), "en")
	role := "路过的人"
	if en {
		role = "A passer-by"
	}
	if e, ok := c.doors[slug]; ok {
		role = e.ZH.Role
		if en {
			role = e.EN.Role
		}
	}
	return fmt.Sprintf("%s · %04d", role, no)
}

// Stamp is where each line of a ticket was borrowed: {group: door number}. Places and keepsakes
// carry their own door; hours and seasons carry the door the traveller rubbed them at.
func (c *Catalog) Stamp(picks model.CompositionPicks, rubbedAt map[string]string) map[string]int {
	marks := map[string]int{}
	for group, key := range picks.ByGroup() {
		if key == "" {
			continue
		}
		f, ok := c.Slip(group, key)
		if !ok {
			continue
		}
		if f.EntranceNo > 0 {
			marks[group] = f.EntranceNo
			continue
		}
		if slug, ok := rubbedAt[f.ID()]; ok {
			if e, ok := c.doors[slug]; ok && containsInt(f.Doors, e.Entrance.No) {
				marks[group] = e.Entrance.No
			}
		}
	}
	return marks
}

// Doors returns the distinct doors of a stamp, by number.
func (c *Catalog) Doors(marks map[string]int) []content.Entrance {
	seen := map[int]bool{}
	var out []content.Entrance
	for _, no := range marks {
		if seen[no] {
			continue
		}
		seen[no] = true
		if e, ok := c.byNo[no]; ok {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Entrance.No < out[j].Entrance.No })
	return out
}

// Realm of a ticket: its place's, else the first slip that has one.
func (c *Catalog) Realm(picks model.CompositionPicks) string {
	for _, g := range compose.Groups {
		key := picks.ByGroup()[g]
		if f, ok := c.Slip(g, key); ok && f.Realm != "" {
			return f.Realm
		}
	}
	return ""
}

// SearchText is what the enquiry desk matches: every slip's text in both languages and the
// labels of the ticket's tags, lower-cased.
func (c *Catalog) SearchText(picks model.CompositionPicks, tags []string) string {
	var parts []string
	for _, g := range compose.Groups {
		f, ok := c.Slip(g, picks.ByGroup()[g])
		if !ok {
			continue
		}
		parts = append(parts, f.ZH.Text, f.ZH.Sub, f.EN.Text, f.EN.Sub)
	}
	for _, key := range tags {
		if t, ok := c.Vocab.Tag(key); ok {
			parts = append(parts, t.ZH, t.EN)
		}
	}
	return strings.ToLower(strings.Join(parts, " "))
}

func containsInt(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func story(t content.Text) []string {
	parts := []string{t.Premise, t.Mission, t.Ending}
	for _, ch := range t.Chapters {
		parts = append(parts, ch.Paragraphs...)
	}
	return parts
}

func zhChars(t content.Text) int {
	n := 0
	for _, s := range story(t) {
		for _, r := range s {
			if unicode.Is(unicode.Han, r) {
				n++
			}
		}
	}
	return n
}

func enWords(t content.Text) int {
	n := 0
	for _, s := range story(t) {
		n += len(strings.Fields(s))
	}
	return n
}

// Runes counts characters, for query length rules.
func Runes(s string) int { return utf8.RuneCountInString(s) }
