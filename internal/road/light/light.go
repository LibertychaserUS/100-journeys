// Package light is how lamps add up on the Ticket Road: the rules of lighting, Bayesian
// shrinkage, the cautious lower bound used for ordering, and what the public may see.
// It has no dependencies, so the store and the handlers can both use it.
package light

import (
	"math"
	"sort"
	"strings"
	"time"
)

// Work kinds that take lamps.
const (
	KindTicket  = "ticket"
	KindJourney = "journey"
)

// Axes are the three wicks: is it real, did it move you, do the hour and the place belong together.
var Axes = []string{"real", "moved", "fit"}

// Rules are the thresholds of lighting and reporting. Defaults() is production; tests shorten them.
type Rules struct {
	MinAccountAge  time.Duration // a lamp only weighs once the account is this old
	TicketDwell    time.Duration // time on a ticket's back before its lamp can be lit
	JourneyFloor   time.Duration // the least reading time for any journey
	ZHCharsPerSec  float64       // reading pace used to scale the floor by length
	ENWordsPerSec  float64
	RelightWindow  time.Duration // a lamp can be adjusted for this long, then it stays
	LampsPerDay    int
	PostsPerDay    int
	ReportsPerDay  int
	TrustedAge     time.Duration // reporters this old count towards dimming a ticket
	DimAfter       int           // trusted reporters who dim a ticket until review
	PublicAfter    int           // travellers before a work's light is shown at all
	Prior          float64       // C: how many average lamps every work starts with
	PriorMean      float64       // m before there is enough light to measure it
	PriorSD        float64
	MinSlipsToPost int
}

func Defaults() Rules {
	return Rules{
		MinAccountAge: 72 * time.Hour, TicketDwell: 8 * time.Second, JourneyFloor: 45 * time.Second,
		ZHCharsPerSec: 9, ENWordsPerSec: 4, RelightWindow: 30 * 24 * time.Hour,
		LampsPerDay: 30, PostsPerDay: 10, ReportsPerDay: 20,
		TrustedAge: 72 * time.Hour, DimAfter: 3, PublicAfter: 5,
		Prior: 8, PriorMean: 3, PriorSD: 1, MinSlipsToPost: 3,
	}
}

// ReadingFloor is the least time between opening a journey and reaching its end for its lamp to
// count: the floor, or the time a quick reader needs for the shorter of its two languages.
func (r Rules) ReadingFloor(zhChars, enWords int) time.Duration {
	sec := math.Min(float64(zhChars)/r.ZHCharsPerSec, float64(enWords)/r.ENWordsPerSec)
	d := time.Duration(sec * float64(time.Second))
	if d < r.JourneyFloor {
		return r.JourneyFloor
	}
	return d
}

// Lamp is one traveller's light on one work.
type Lamp struct {
	Real, Moved, Fit int // 0 = that wick was not pulled
	Stamp            string
	Weight           float64
}

// Mean is the lamp's average over the wicks that were pulled, 0 when none were.
func (l Lamp) Mean() float64 {
	sum, n := 0, 0
	for _, v := range []int{l.Real, l.Moved, l.Fit} {
		if v > 0 {
			sum += v
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return float64(sum) / float64(n)
}

// Totals is what lamps add up to for one work.
type Totals struct {
	N         int     // travellers whose lamp weighs
	WSum      float64 // their total weight
	RealM     float64 // shrunk mean per wick
	MovedM    float64
	FitM      float64
	Bright    float64 // shrunk overall mean, 1-5
	Lower     float64 // a cautious bright for ordering
	TopAxis   string
	TopStamps []string
}

// Sum adds lamps up with Bayesian shrinkage towards the kind's mean m: a work starts as if C
// average lamps were already lit, so two full lamps do not outshine twenty warm ones.
func Sum(lamps []Lamp, m float64, r Rules) Totals {
	var t Totals
	axis := map[string][2]float64{} // weighted sum, weight
	stamps := map[string]float64{}
	var sx, sxx float64
	for _, l := range lamps {
		if l.Weight <= 0 {
			continue
		}
		x := l.Mean()
		if x > 0 {
			t.N++
			t.WSum += l.Weight
			sx += l.Weight * x
			sxx += l.Weight * x * x
		}
		for i, v := range []int{l.Real, l.Moved, l.Fit} {
			if v > 0 {
				a := axis[Axes[i]]
				axis[Axes[i]] = [2]float64{a[0] + l.Weight*float64(v), a[1] + l.Weight}
			}
		}
		if l.Stamp != "" {
			stamps[l.Stamp] += l.Weight
			if x == 0 { // a stamp alone still means someone passed by
				t.N++
			}
		}
	}
	c := r.Prior
	t.Bright = (c*m + sx) / (c + t.WSum)
	variance := (c*r.PriorSD*r.PriorSD + (sxx - 2*t.Bright*sx + t.Bright*t.Bright*t.WSum)) / (c + t.WSum)
	if variance < 0 {
		variance = 0
	}
	t.Lower = t.Bright - 1.28*math.Sqrt(variance)/math.Sqrt(c+t.WSum)
	shrunk := func(name string) float64 {
		a := axis[name]
		return (c*m + a[0]) / (c + a[1])
	}
	t.RealM, t.MovedM, t.FitM = shrunk("real"), shrunk("moved"), shrunk("fit")
	best := -1.0
	for _, name := range Axes {
		if axis[name][1] == 0 {
			continue
		}
		if v := shrunk(name); v > best {
			best, t.TopAxis = v, name
		}
	}
	keys := make([]string, 0, len(stamps))
	for k := range stamps {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if stamps[keys[i]] != stamps[keys[j]] {
			return stamps[keys[i]] > stamps[keys[j]]
		}
		return keys[i] < keys[j]
	})
	if len(keys) > 2 {
		keys = keys[:2]
	}
	t.TopStamps = keys
	return t
}

// Glow is the five-step halo the public sees, from bright on the 1-5 scale.
func Glow(bright float64) int {
	g := int(math.Round((bright - 1) * 5 / 4))
	if g < 0 {
		return 0
	}
	if g > 5 {
		return 5
	}
	return g
}

// Public is what anyone may see of a work's light: nothing until enough travellers have lit it,
// then the halo, how many travellers, the brightest wick and the two most pressed stamps.
type Public struct {
	Glow      *int     `json:"glow"`
	Count     *int     `json:"count"`
	TopAxis   string   `json:"top_axis,omitempty"`
	TopStamps []string `json:"top_stamps"`
}

func (t Totals) Public(r Rules) Public {
	p := Public{TopStamps: []string{}}
	if t.N < r.PublicAfter {
		return p
	}
	g, n := Glow(t.Bright), t.N
	p.Glow, p.Count, p.TopAxis, p.TopStamps = &g, &n, t.TopAxis, t.TopStamps
	return p
}

// JoinKeys / SplitKeys store short key lists in one column.
func JoinKeys(keys []string) string { return strings.Join(keys, ",") }

func SplitKeys(s string) []string {
	if s == "" {
		return []string{}
	}
	return strings.Split(s, ",")
}
