package handler

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/road"
	"github.com/100-journeys/app/internal/road/light"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

// RoadHandler serves the Ticket Road: rubbings, the night station, lamps, the rack by the
// door and the safety base. Public reads come from an in-process cache that every write
// invalidates; writes are one short transaction each and go through a per-account bucket.
type RoadHandler struct {
	repo   *repository.RoadRepository
	comps  repository.CompositionRepository
	cat    *road.Catalog
	rules  light.Rules
	now    func() time.Time
	cache  *viewCache
	bucket *middleware.Bucket
}

func NewRoadHandler(repo *repository.RoadRepository, comps repository.CompositionRepository, cat *road.Catalog, rules light.Rules) *RoadHandler {
	return &RoadHandler{repo: repo, comps: comps, cat: cat, rules: rules, now: time.Now, cache: newViewCache(1024), bucket: middleware.NewBucket(40, 20)}
}

// SetClock replaces the clock (tests).
func (h *RoadHandler) SetClock(now func() time.Time) { h.now = now }

const carriage = 24 // tickets per page of the station: one carriage, then "the next train"

var (
	authorHash = regexp.MustCompile(`^[0-9a-f]{16}$`)
	slugRe     = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
)

// ---------- views ----------

// TicketView is a posted ticket as anyone may see it: slips, postmarks, tags, an alias and
// its light. No account, time of day or place of the author.
type TicketView struct {
	Code     string                 `json:"code"`
	Picks    model.CompositionPicks `json:"picks"`
	Realm    string                 `json:"realm,omitempty"`
	Marks    map[string]int         `json:"marks"`
	Transfer bool                   `json:"transfer"`
	Alias    string                 `json:"alias"`
	AID      string                 `json:"aid"`
	Tags     []string               `json:"tags"`
	Day      string                 `json:"day"`
	Light    light.Public           `json:"light"`
	OpenNow  bool                   `json:"open_now,omitempty"`
	Mine     bool                   `json:"mine,omitempty"`
	Status   string                 `json:"status,omitempty"`
}

func (h *RoadHandler) view(p repository.PostRow, lang string) TicketView {
	return TicketView{
		Code: p.Code, Picks: p.Picks, Realm: p.Realm, Marks: p.Marks, Transfer: p.Transfer,
		Alias: h.cat.Alias(p.AliasSlug, p.AliasNo, lang), AID: p.AuthorHash, Tags: p.Tags,
		Day: p.PostedAt.UTC().Format("2006-01-02"), Light: p.Totals.Public(h.rules),
	}
}

func viewer(c *gin.Context) int64 {
	if v, ok := c.Get("user_id"); ok {
		if id, ok := v.(int64); ok {
			return id
		}
	}
	return 0
}

// ---------- vocabulary ----------

// GET /api/road/vocab?lang= — printed tags, stamps, flags and report reasons in one language.
func (h *RoadHandler) Vocab(c *gin.Context) {
	lang := service.NormalizeLocale(c.Query("lang"))
	type item struct {
		Key   string `json:"key"`
		Kind  string `json:"kind,omitempty"`
		Label string `json:"label"`
	}
	list := func(labels []road.Label) []item {
		out := make([]item, len(labels))
		for i, l := range labels {
			out[i] = item{Key: l.Key, Label: l.Name(lang)}
		}
		return out
	}
	tags := make([]item, len(h.cat.Vocab.Tags))
	for i, t := range h.cat.Vocab.Tags {
		tags[i] = item{Key: t.Key, Kind: t.Kind, Label: t.Name(lang)}
	}
	c.Header("Cache-Control", "public, max-age=300")
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{
		"tags": tags, "stamps": list(h.cat.Vocab.Stamps), "flags": list(h.cat.Vocab.Flags), "reasons": list(h.cat.Vocab.Reasons),
		"axes": light.Axes, "max_tags": road.MaxTags, "public_after": h.rules.PublicAfter, "dwell_s": int(h.rules.TicketDwell.Seconds()),
	}))
}

// ---------- rubbings and arrivals ----------

// GET /api/auth/rubbings — slip id -> the door it was rubbed at.
func (h *RoadHandler) Rubbings(c *gin.Context) {
	list, err := h.repo.Rubbings(c.Request.Context(), viewer(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load rubbings"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(list))
}

type rubRequest struct {
	Slug   string `json:"slug"`
	Option string `json:"option"`
}

// POST /api/auth/rubbings — the end of a door was rubbed: its place, hour, seasons and the
// keepsake of the fork option picked go to the traveller, and the arrival is recorded.
func (h *RoadHandler) Rub(c *gin.Context) {
	var req rubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid rubbing"))
		return
	}
	door, ok := h.cat.Door(req.Slug)
	if !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
		return
	}
	uid := viewer(c)
	option := req.Option
	if option == "" {
		option, _ = h.repo.Choice(c.Request.Context(), uid, req.Slug)
	}
	if option != "" && (door.ZH.Choice == nil || !hasOption(door.ZH.Choice.Options, option)) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid choice"))
		return
	}
	slips := h.cat.Rubbed(door, option)
	ids := make([]string, len(slips))
	for i, f := range slips {
		ids[i] = f.ID()
	}
	fresh, err := h.repo.Rub(c.Request.Context(), uid, req.Slug, ids, h.now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to rub"))
		return
	}
	if fresh == nil {
		fresh = []string{}
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"slug": req.Slug, "no": door.Entrance.No, "rubbed": ids, "fresh": fresh}))
}

func hasOption(options []content.Option, key string) bool {
	for _, o := range options {
		if o.Key == key {
			return true
		}
	}
	return false
}

type mergeRubbingsRequest struct {
	Rubbings map[string]string `json:"rubbings"`
}

// POST /api/auth/rubbings/merge — a guest's rubbings join the account (idempotent). Only slips
// that the named door really hands out are kept; the rest are skipped.
func (h *RoadHandler) MergeRubbings(c *gin.Context) {
	var req mergeRubbingsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Rubbings) > 600 {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid rubbings"))
		return
	}
	valid := map[string]string{}
	skipped := []string{}
	for id, slug := range req.Rubbings {
		if h.cat.CanRubAt(id, slug) {
			valid[id] = slug
		} else {
			skipped = append(skipped, id)
		}
	}
	sort.Strings(skipped)
	uid := viewer(c)
	added, err := h.repo.MergeRubbings(c.Request.Context(), uid, valid, h.now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to merge rubbings"))
		return
	}
	all, err := h.repo.Rubbings(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load rubbings"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"added": added, "skipped": skipped, "rubbings": all}))
}

type arriveRequest struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
	Step string `json:"step"`
}

// POST /api/auth/arrivals — opened a work ("view") or reached its end ("end").
func (h *RoadHandler) Arrive(c *gin.Context) {
	var req arriveRequest
	if err := c.ShouldBindJSON(&req); err != nil || (req.Step != "view" && req.Step != "end") {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid arrival"))
		return
	}
	switch req.Kind {
	case light.KindJourney:
		if _, ok := h.cat.Door(req.ID); !ok {
			c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
			return
		}
	case light.KindTicket:
		if req.Step != "view" || !h.liveTicket(c.Request.Context(), req.ID) {
			c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
			return
		}
	default:
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid arrival"))
		return
	}
	if err := h.repo.Arrive(c.Request.Context(), viewer(c), req.Kind, req.ID, req.Step, h.now()); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to record arrival"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"ok": true}))
}

func (h *RoadHandler) liveTicket(ctx context.Context, code string) bool {
	if !compositionCode.MatchString(code) {
		return false
	}
	p, err := h.repo.Post(ctx, code)
	return err == nil && p != nil && p.Status == "live"
}

type ageBandRequest struct {
	AgeBand string `json:"age_band"`
}

// PUT /api/auth/age-band — older accounts declare their band once.
func (h *RoadHandler) SetAgeBand(c *gin.Context) {
	var req ageBandRequest
	if err := c.ShouldBindJSON(&req); err != nil || !content.Contains(model.AgeBands, req.AgeBand) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid age band"))
		return
	}
	set, err := h.repo.SetAgeBand(c.Request.Context(), viewer(c), req.AgeBand)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save age band"))
		return
	}
	if !set {
		c.JSON(http.StatusConflict, newErrorEnvelope("age band already declared"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"age_band": req.AgeBand}))
}

// ---------- posting ----------

type postRequest struct {
	Tags []string `json:"tags"`
}

// POST /api/auth/tickets/:code/post — hang a kept ticket on the station and by its doors.
func (h *RoadHandler) Publish(c *gin.Context) {
	ctx := c.Request.Context()
	uid := viewer(c)
	code := c.Param("code")
	var req postRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid post"))
		return
	}
	acct, err := h.repo.Account(ctx, uid)
	if err != nil || acct == nil {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("invalid or expired token"))
		return
	}
	switch {
	case acct.Silenced:
		c.JSON(http.StatusForbidden, newErrorEnvelope("account silenced"))
		return
	case acct.AgeBand == "":
		c.JSON(http.StatusConflict, newErrorEnvelope("age band needed"))
		return
	case acct.AgeBand == "under14":
		c.JSON(http.StatusForbidden, newErrorEnvelope("station closed under 14"))
		return
	}
	if !compositionCode.MatchString(code) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	comp, err := h.comps.GetByCode(ctx, code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load composition"))
		return
	}
	if comp == nil || comp.UserID != uid {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	picked := 0
	for g, key := range comp.Picks.ByGroup() {
		if _, ok := h.cat.Slip(g, key); ok {
			picked++
		}
	}
	if picked < h.rules.MinSlipsToPost {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("ticket needs more slips"))
		return
	}
	tags, ok := h.cleanTags(req.Tags)
	if !ok {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("unknown tag"))
		return
	}
	rubbed, err := h.repo.Rubbings(ctx, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load rubbings"))
		return
	}
	marks := h.cat.Stamp(comp.Picks, rubbed)
	doors := h.cat.Doors(marks)
	slugs := make([]string, len(doors))
	for i, d := range doors {
		slugs[i] = d.Slug
	}
	alias := ""
	if no, ok := marks["place"]; ok {
		if d, ok := h.cat.DoorNo(no); ok {
			alias = d.Slug
		}
	} else if len(slugs) > 0 {
		alias = slugs[0]
	}
	hash := h.cat.AuthorHash(uid)
	created, err := h.repo.Publish(ctx, repository.PostInput{
		Code: code, UserID: uid, AuthorHash: hash, AliasSlug: alias, AliasNo: road.AliasNo(hash),
		Realm: h.cat.Realm(comp.Picks), Picks: comp.Picks, Marks: marks, Transfer: len(doors) >= 2,
		SearchText: h.cat.SearchText(comp.Picks, tags), Tags: tags, Doors: slugs, Now: h.now(), Cap: h.rules.PostsPerDay,
	})
	switch {
	case errors.Is(err, repository.ErrPostRemoved):
		c.JSON(http.StatusForbidden, newErrorEnvelope(err.Error()))
		return
	case errors.Is(err, repository.ErrDailyCap):
		c.JSON(http.StatusTooManyRequests, newErrorEnvelope(err.Error()))
		return
	case err != nil:
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to post ticket"))
		return
	}
	h.cache.bump()
	p, err := h.repo.Post(ctx, code)
	if err != nil || p == nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to post ticket"))
		return
	}
	v := h.view(*p, c.Query("lang"))
	v.Mine, v.Status = true, p.Status
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, newDataEnvelope(v))
}

func (h *RoadHandler) cleanTags(in []string) ([]string, bool) {
	out := []string{}
	seen := map[string]bool{}
	for _, t := range in {
		if seen[t] {
			continue
		}
		if _, ok := h.cat.Vocab.Tag(t); !ok {
			return nil, false
		}
		seen[t] = true
		out = append(out, t)
	}
	if len(out) > road.MaxTags {
		return nil, false
	}
	return out, true
}

// DELETE /api/auth/tickets/:code/post — take it down again.
func (h *RoadHandler) Unpublish(c *gin.Context) {
	done, err := h.repo.Unpublish(c.Request.Context(), viewer(c), c.Param("code"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to take ticket down"))
		return
	}
	if !done {
		c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
		return
	}
	h.cache.bump()
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"code": c.Param("code"), "posted": false}))
}

// GET /api/auth/tickets/posted — code -> status for the traveller's own tickets.
func (h *RoadHandler) MyPosts(c *gin.Context) {
	list, err := h.repo.PostsByUser(c.Request.Context(), viewer(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load posts"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(list))
}

// ---------- the station ----------

// GET /api/station?realm=&season=&hour=&place=&tag=&q=&sort=bright|new|borrowed&cursor=&lang=
func (h *RoadHandler) Station(c *gin.Context) {
	ctx := c.Request.Context()
	q := repository.StationQuery{Limit: carriage + 1, Sort: c.DefaultQuery("sort", "bright")}
	if q.Sort != "bright" && q.Sort != "new" && q.Sort != "borrowed" {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid sort"))
		return
	}
	pick := func(name string, ok func(string) bool) (string, bool) {
		v := strings.TrimSpace(c.Query(name))
		if v == "" || ok(v) {
			return v, true
		}
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid "+name))
		return "", false
	}
	var ok bool
	in := func(list []string) func(string) bool { return func(v string) bool { return content.Contains(list, v) } }
	if q.Realm, ok = pick("realm", in(content.Realms)); !ok {
		return
	}
	if q.Season, ok = pick("season", in(content.Seasons)); !ok {
		return
	}
	if q.Hour, ok = pick("hour", in(content.Times)); !ok {
		return
	}
	if q.Place, ok = pick("place", func(v string) bool { _, ok := h.cat.Slip("place", v); return ok }); !ok {
		return
	}
	if q.Tag, ok = pick("tag", func(v string) bool { _, ok := h.cat.Vocab.Tag(v); return ok }); !ok {
		return
	}
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	if road.Runes(query) > 40 {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("query too long"))
		return
	}
	q.Terms = strings.Fields(query)
	if len(q.Terms) > 4 {
		q.Terms = q.Terms[:4]
	}
	q.FTS = len(q.Terms) > 0
	for _, t := range q.Terms {
		if road.Runes(t) < 3 { // trigram search needs three characters; shorter words use LIKE
			q.FTS = false
		}
	}
	if raw := c.Query("cursor"); raw != "" {
		cur, err := decodeCursor(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid cursor"))
			return
		}
		q.After = cur
	}
	lang := service.NormalizeLocale(c.Query("lang"))
	uid := viewer(c)
	if uid > 0 {
		blocked, err := h.repo.Blocks(ctx, uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load station"))
			return
		}
		q.Blocked = blocked
	}
	key := "station|" + lang + "|" + c.Request.URL.RawQuery + "|" + digest(q.Blocked) + "|" + strconv.FormatInt(uid, 10)
	if body, ok := h.cache.get(key); ok {
		c.Data(http.StatusOK, "application/json; charset=utf-8", body)
		return
	}
	gen := h.cache.generation()
	rows, err := h.repo.Station(ctx, q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load station"))
		return
	}
	next := ""
	if len(rows) > carriage {
		rows = rows[:carriage]
		next = encodeCursor(repository.CursorFor(rows[len(rows)-1], q.Sort))
	}
	items := make([]TicketView, len(rows))
	for i, p := range rows {
		items[i] = h.view(p, lang)
		items[i].Mine = uid > 0 && p.UserID == uid
	}
	body, _ := json.Marshal(newDataEnvelope(gin.H{"items": items, "next": next, "sort": q.Sort}))
	h.cache.put(key, body, gen, 60*time.Second)
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

func digest(list []string) string {
	if len(list) == 0 {
		return ""
	}
	sum := sha1.Sum([]byte(strings.Join(list, ",")))
	return hex.EncodeToString(sum[:8])
}

func encodeCursor(c repository.StationCursor) string {
	raw := strconv.FormatFloat(c.Num, 'g', -1, 64) + "|" + c.At + "|" + c.Code
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(s string) (*repository.StationCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	parts := strings.SplitN(string(raw), "|", 3)
	if len(parts) != 3 || !compositionCode.MatchString(parts[2]) {
		return nil, errors.New("bad cursor")
	}
	num, err := strconv.ParseFloat(parts[0], 64)
	if err != nil || math.IsNaN(num) || math.IsInf(num, 0) {
		return nil, errors.New("bad cursor")
	}
	if _, err := time.Parse("2006-01-02 15:04:05", parts[1]); err != nil {
		return nil, errors.New("bad cursor")
	}
	return &repository.StationCursor{Num: num, At: parts[1], Code: parts[2]}, nil
}

// GET /api/station/tickets/:code — the back of one ticket.
func (h *RoadHandler) Ticket(c *gin.Context) {
	code := c.Param("code")
	if !compositionCode.MatchString(code) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
		return
	}
	p, err := h.repo.Post(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load ticket"))
		return
	}
	uid := viewer(c)
	mine := p != nil && uid > 0 && p.UserID == uid
	if p == nil || (p.Status != "live" && !mine) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
		return
	}
	v := h.view(*p, c.Query("lang"))
	if mine {
		v.Mine, v.Status = true, p.Status
	}
	c.JSON(http.StatusOK, newDataEnvelope(v))
}

// GET /api/entrances/:slug/rack?hour=&lang= — at most six tickets that borrowed from this door.
// The viewer's hour bucket (computed on their device, never stored) brings tickets of that hour
// to the front; the rest rotate daily, one ticket per author.
func (h *RoadHandler) Rack(c *gin.Context) {
	slug := c.Param("slug")
	if _, ok := h.cat.Door(slug); !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
		return
	}
	hour := c.Query("hour")
	if !content.Contains(content.Times, hour) {
		hour = ""
	}
	lang := service.NormalizeLocale(c.Query("lang"))
	day := h.now().UTC().Format("2006-01-02")
	key := "rack|" + slug + "|" + hour + "|" + lang + "|" + day
	body, ok := h.cache.get(key)
	if !ok {
		gen := h.cache.generation()
		rows, err := h.repo.RackCandidates(c.Request.Context(), slug, 200)
		if err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load rack"))
			return
		}
		picked := h.rotate(rows, slug+"|"+day+"|"+hour, hour, 6)
		items := make([]TicketView, len(picked))
		for i, p := range picked {
			items[i] = h.view(p, lang)
			items[i].OpenNow = hour != "" && p.Picks.Hour == hour
		}
		body, _ = json.Marshal(newDataEnvelope(items))
		h.cache.put(key, body, gen, 10*time.Minute)
	}
	// Signed in, your own tickets for this door hang first (the line stays at six).
	if uid := viewer(c); uid > 0 {
		own, err := h.repo.OwnRack(c.Request.Context(), uid, slug, 2)
		if err == nil && len(own) > 0 {
			var env struct {
				Data []TicketView `json:"data"`
			}
			if json.Unmarshal(body, &env) == nil {
				items := make([]TicketView, 0, 6)
				seen := map[string]bool{}
				for _, p := range own {
					v := h.view(p, lang)
					v.Mine, v.OpenNow = true, hour != "" && p.Picks.Hour == hour
					items = append(items, v)
					seen[p.Code] = true
				}
				for _, v := range env.Data {
					if len(items) >= 6 {
						break
					}
					if !seen[v.Code] && v.AID != own[0].AuthorHash {
						items = append(items, v)
					}
				}
				body, _ = json.Marshal(newDataEnvelope(items))
			}
		}
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// rotate scores candidates by "open now", recency and a seeded shuffle, then keeps one ticket per
// author and prefers realms not shown yet.
func (h *RoadHandler) rotate(rows []repository.PostRow, seed, hour string, n int) []repository.PostRow {
	now := h.now()
	type scored struct {
		p repository.PostRow
		s float64
	}
	list := make([]scored, len(rows))
	for i, p := range rows {
		s := 2 * math.Exp(-now.Sub(p.PostedAt).Hours()/24/21)
		if hour != "" && p.Picks.Hour == hour {
			s += 3
		}
		sum := sha1.Sum([]byte(seed + "|" + p.Code))
		s += 1.5 * float64(binary.BigEndian.Uint32(sum[:4])) / math.MaxUint32
		list[i] = scored{p, s}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].s > list[j].s })
	authors := map[string]bool{}
	realms := map[string]bool{}
	var out, later []repository.PostRow
	for _, x := range list {
		if authors[x.p.AuthorHash] {
			continue
		}
		authors[x.p.AuthorHash] = true
		if realms[x.p.Realm] {
			later = append(later, x.p)
			continue
		}
		realms[x.p.Realm] = true
		out = append(out, x.p)
	}
	out = append(out, later...)
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// GET /api/space/:type/drifted?lang= — three tickets the wind brought: they borrowed from doors
// written for this type. Matching reads the doors, never the authors.
func (h *RoadHandler) Drifted(c *gin.Context) {
	code := strings.ToUpper(c.Param("type"))
	if !mbtiCodes[code] {
		c.JSON(http.StatusNotFound, newErrorEnvelope("not found"))
		return
	}
	lang := service.NormalizeLocale(c.Query("lang"))
	day := h.now().UTC().Format("2006-01-02")
	key := "drift|" + code + "|" + lang + "|" + day
	if body, ok := h.cache.get(key); ok {
		c.Data(http.StatusOK, "application/json; charset=utf-8", body)
		return
	}
	gen := h.cache.generation()
	rows, err := h.repo.DriftCandidates(c.Request.Context(), code, 120)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load tickets"))
		return
	}
	picked := h.rotate(rows, code+"|"+day, "", 3)
	items := make([]TicketView, len(picked))
	for i, p := range picked {
		items[i] = h.view(p, lang)
	}
	body, _ := json.Marshal(newDataEnvelope(items))
	h.cache.put(key, body, gen, 10*time.Minute)
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// ---------- lamps ----------

func (h *RoadHandler) workExists(ctx context.Context, kind, id string) (owner int64, ok bool) {
	switch kind {
	case light.KindJourney:
		_, ok := h.cat.Door(id)
		return 0, ok
	case light.KindTicket:
		if !compositionCode.MatchString(id) {
			return 0, false
		}
		p, err := h.repo.Post(ctx, id)
		if err != nil || p == nil || p.Status != "live" {
			return 0, false
		}
		return p.UserID, true
	}
	return 0, false
}

// GET /api/lamps/:kind/:id — the public light of a work.
func (h *RoadHandler) Light(c *gin.Context) {
	kind, id := c.Param("kind"), c.Param("id")
	if _, ok := h.workExists(c.Request.Context(), kind, id); !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("work not found"))
		return
	}
	t, err := h.repo.Totals(c.Request.Context(), kind, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load light"))
		return
	}
	c.Header("Cache-Control", "public, max-age=60")
	c.JSON(http.StatusOK, newDataEnvelope(t.Public(h.rules)))
}

type lampView struct {
	Real    int      `json:"real"`
	Moved   int      `json:"moved"`
	Fit     int      `json:"fit"`
	Stamp   string   `json:"stamp"`
	Flags   []string `json:"flags"`
	Settled bool     `json:"settled"`
}

// GET /api/auth/lamps/:kind/:id — the traveller's own lamp, whether they may light it now, and
// the public light.
func (h *RoadHandler) MyLamp(c *gin.Context) {
	ctx := c.Request.Context()
	kind, id := c.Param("kind"), c.Param("id")
	owner, ok := h.workExists(ctx, kind, id)
	if !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("work not found"))
		return
	}
	uid := viewer(c)
	l, err := h.repo.Lamp(ctx, kind, id, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load lamp"))
		return
	}
	t, err := h.repo.Totals(ctx, kind, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load light"))
		return
	}
	out := gin.H{"light": t.Public(h.rules), "own": owner == uid && uid > 0, "wait_s": h.waitFor(ctx, uid, kind, id)}
	if l != nil {
		out["mine"] = lampView{Real: l.Real, Moved: l.Moved, Fit: l.Fit, Stamp: l.Stamp, Flags: l.Flags, Settled: h.now().Sub(l.CreatedAt) > h.rules.RelightWindow}
	}
	c.JSON(http.StatusOK, newDataEnvelope(out))
}

// waitFor is how long until the traveller has "arrived" at a work (0 = they have). -1: they have
// not started it yet.
func (h *RoadHandler) waitFor(ctx context.Context, uid int64, kind, id string) int {
	first, arrived, ok, err := h.repo.Arrival(ctx, uid, kind, id)
	if err != nil || !ok {
		return -1
	}
	need := h.rules.TicketDwell
	end := h.now()
	if kind == light.KindJourney {
		zh, en := h.cat.Reading(id)
		need = h.rules.ReadingFloor(zh, en)
		if arrived.IsZero() {
			return int(math.Ceil(need.Seconds()))
		}
		end = arrived
	}
	if left := need - end.Sub(first); left > 0 {
		return int(math.Ceil(left.Seconds()))
	}
	return 0
}

type lightRequest struct {
	Kind  string   `json:"kind"`
	ID    string   `json:"id"`
	Real  int      `json:"real"`
	Moved int      `json:"moved"`
	Fit   int      `json:"fit"`
	Stamp string   `json:"stamp"`
	Flags []string `json:"flags"`
}

// POST /api/auth/lamps — light (or, within 30 days, adjust) a lamp. Only after arriving; never on
// your own ticket; 30 a day. The lamp weighs once the account is 72 hours old and has read a
// journey through. Returns the public light so the shade can lift.
func (h *RoadHandler) LightLamp(c *gin.Context) {
	ctx := c.Request.Context()
	var req lightRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid lamp"))
		return
	}
	for _, v := range []int{req.Real, req.Moved, req.Fit} {
		if v < 0 || v > 5 {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid lamp"))
			return
		}
	}
	if req.Stamp != "" && !h.cat.Vocab.HasStamp(req.Stamp) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid lamp"))
		return
	}
	flags := []string{}
	seen := map[string]bool{}
	for _, f := range req.Flags {
		if !h.cat.Vocab.HasFlag(f) {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid lamp"))
			return
		}
		if !seen[f] {
			seen[f] = true
			flags = append(flags, f)
		}
	}
	if req.Real == 0 && req.Moved == 0 && req.Fit == 0 && req.Stamp == "" {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("lamp needs a wick or a stamp"))
		return
	}
	uid := viewer(c)
	owner, ok := h.workExists(ctx, req.Kind, req.ID)
	if !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("work not found"))
		return
	}
	if owner == uid {
		c.JSON(http.StatusForbidden, newErrorEnvelope("own work"))
		return
	}
	acct, err := h.repo.Account(ctx, uid)
	if err != nil || acct == nil {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("invalid or expired token"))
		return
	}
	if acct.Silenced {
		c.JSON(http.StatusForbidden, newErrorEnvelope("account silenced"))
		return
	}
	if wait := h.waitFor(ctx, uid, req.Kind, req.ID); wait != 0 {
		c.JSON(http.StatusConflict, gin.H{"data": gin.H{"wait_s": wait}, "error": "not arrived"})
		return
	}
	weight := 0.0
	if h.now().Sub(acct.CreatedAt) >= h.rules.MinAccountAge {
		if read, err := h.repo.HasRead(ctx, uid, h.rules.JourneyFloor); err == nil && read {
			weight = 1
		}
	}
	totals, err := h.repo.Light(ctx, repository.LightInput{Kind: req.Kind, ID: req.ID, UserID: uid, Real: req.Real, Moved: req.Moved, Fit: req.Fit,
		Stamp: req.Stamp, Flags: flags, Weight: weight, Now: h.now(), Rules: h.rules})
	switch {
	case errors.Is(err, repository.ErrDailyCap):
		c.JSON(http.StatusTooManyRequests, newErrorEnvelope(err.Error()))
		return
	case errors.Is(err, repository.ErrLampLocked):
		c.JSON(http.StatusConflict, newErrorEnvelope(err.Error()))
		return
	case err != nil:
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to light lamp"))
		return
	}
	h.cache.bump()
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"light": totals.Public(h.rules), "mine": lampView{Real: req.Real, Moved: req.Moved, Fit: req.Fit, Stamp: req.Stamp, Flags: flags}}))
}

// GET /api/auth/ledger/:kind/:id — the author's ledger: the whole distribution, stamps and the
// private flags, never who lit what. Tickets: their author; journeys: the station master. Only
// once enough travellers have lit it.
func (h *RoadHandler) Ledger(c *gin.Context) {
	ctx := c.Request.Context()
	kind, id := c.Param("kind"), c.Param("id")
	owner, ok := h.workExists(ctx, kind, id)
	if !ok && kind == light.KindTicket { // a dimmed ticket's author still reads its ledger
		if p, err := h.repo.Post(ctx, id); err == nil && p != nil {
			owner, ok = p.UserID, true
		}
	}
	if !ok {
		c.JSON(http.StatusNotFound, newErrorEnvelope("work not found"))
		return
	}
	uid := viewer(c)
	role, _ := c.Get("role")
	if (kind == light.KindTicket && owner != uid) || (kind == light.KindJourney && role != model.RoleAdmin) {
		c.JSON(http.StatusForbidden, newErrorEnvelope("not your ledger"))
		return
	}
	t, err := h.repo.Totals(ctx, kind, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load ledger"))
		return
	}
	if t.N < h.rules.PublicAfter {
		c.JSON(http.StatusOK, newDataEnvelope(gin.H{"ready": false, "needed": h.rules.PublicAfter}))
		return
	}
	l, err := h.repo.Ledger(ctx, kind, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load ledger"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"ready": true, "ledger": l, "glow": light.Glow(t.Bright),
		"means": gin.H{"real": t.RealM, "moved": t.MovedM, "fit": t.FitM}}))
}

// ---------- reports and blocks ----------

type reportRequest struct {
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// POST /api/auth/reports — "交给站务". The answer never says whether the ticket was dimmed.
func (h *RoadHandler) Report(c *gin.Context) {
	ctx := c.Request.Context()
	var req reportRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Kind != light.KindTicket || !h.cat.Vocab.HasReason(req.Reason) || !compositionCode.MatchString(req.ID) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid report"))
		return
	}
	p, err := h.repo.Post(ctx, req.ID)
	if err != nil || p == nil || p.Status == "removed" {
		c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
		return
	}
	uid := viewer(c)
	if p.UserID == uid {
		c.JSON(http.StatusForbidden, newErrorEnvelope("own work"))
		return
	}
	acct, err := h.repo.Account(ctx, uid)
	if err != nil || acct == nil {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("invalid or expired token"))
		return
	}
	trusted := !acct.Silenced && h.now().Sub(acct.CreatedAt) >= h.rules.TrustedAge
	dimmed, err := h.repo.Report(ctx, req.ID, uid, req.Reason, trusted, h.now(), h.rules)
	switch {
	case errors.Is(err, repository.ErrDailyCap):
		c.JSON(http.StatusTooManyRequests, newErrorEnvelope(err.Error()))
		return
	case err != nil:
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to report"))
		return
	}
	if dimmed {
		h.cache.bump()
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"received": true}))
}

// GET /api/auth/blocks
func (h *RoadHandler) Blocks(c *gin.Context) {
	list, err := h.repo.Blocks(c.Request.Context(), viewer(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load blocks"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(list))
}

// PUT|DELETE /api/auth/blocks/:aid — "不再同站", silently.
func (h *RoadHandler) Block(c *gin.Context) {
	aid := c.Param("aid")
	if !authorHash.MatchString(aid) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid author"))
		return
	}
	if aid == h.cat.AuthorHash(viewer(c)) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid author"))
		return
	}
	on := c.Request.Method == http.MethodPut
	if err := h.repo.Block(c.Request.Context(), viewer(c), aid, on, h.now()); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to update blocks"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"aid": aid, "blocked": on}))
}

// ---------- the station master ----------

type queueView struct {
	Ticket  TicketView     `json:"ticket"`
	Status  string         `json:"status"`
	Reasons map[string]int `json:"reasons"`
	Reports int            `json:"reports"`
	Trusted int            `json:"trusted"`
}

// GET /api/admin/road/queue — dimmed or reported tickets, dimmed first.
func (h *RoadHandler) Queue(c *gin.Context) {
	items, err := h.repo.Queue(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load queue"))
		return
	}
	lang := service.NormalizeLocale(c.Query("lang"))
	out := make([]queueView, len(items))
	for i, it := range items {
		out[i] = queueView{Ticket: h.view(it.Post, lang), Status: it.Post.Status, Reasons: it.Reasons, Reports: it.Reports, Trusted: it.Trusted}
	}
	c.JSON(http.StatusOK, newDataEnvelope(out))
}

type reviewRequest struct {
	Action string `json:"action"`
}

// POST /api/admin/road/posts/:code — restore, remove, or silence the author.
func (h *RoadHandler) Review(c *gin.Context) {
	var req reviewRequest
	if err := c.ShouldBindJSON(&req); err != nil || (req.Action != "restore" && req.Action != "remove" && req.Action != "silence") {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid review"))
		return
	}
	err := h.repo.Review(c.Request.Context(), c.Param("code"), req.Action, h.now(), h.rules)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("ticket not found"))
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to review"))
		return
	}
	h.cache.bump()
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"code": c.Param("code"), "action": req.Action}))
}

// ---------- nightly ----------

// Nightly recomputes lamp weights and totals at about 04:00 local time, and once shortly after
// start, until ctx ends.
func (h *RoadHandler) Nightly(ctx context.Context, logf func(string, ...interface{})) {
	run := func() {
		if err := h.repo.Recompute(ctx, h.rules, h.now()); err != nil {
			logf("road: nightly recompute: %v", err)
			return
		}
		h.cache.bump()
	}
	select {
	case <-ctx.Done():
		return
	case <-time.After(20 * time.Second):
		run()
	}
	last := h.now()
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			now := h.now()
			four := time.Date(now.Year(), now.Month(), now.Day(), 4, 0, 0, 0, now.Location())
			if !now.Before(four) && last.Before(four) {
				run()
			}
			last = now
		}
	}
}

// ---------- routes ----------

// RoadRoutes registers the public reads, the signed-in writes (through the per-account bucket)
// and the station master's queue.
func RoadRoutes(api *gin.RouterGroup, h *RoadHandler) {
	api.GET("/road/vocab", h.Vocab)
	pub := api.Group("")
	pub.Use(middleware.OptionalJWT())
	pub.GET("/station", h.Station)
	pub.GET("/station/tickets/:code", h.Ticket)
	pub.GET("/entrances/:slug/rack", h.Rack)
	api.GET("/space/:type/drifted", h.Drifted)
	api.GET("/lamps/:kind/:id", h.Light)

	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.GET("/rubbings", h.Rubbings)
	auth.GET("/tickets/posted", h.MyPosts)
	auth.GET("/lamps/:kind/:id", h.MyLamp)
	auth.GET("/ledger/:kind/:id", h.Ledger)
	auth.GET("/blocks", h.Blocks)
	writes := auth.Group("")
	writes.Use(h.bucket.Limit())
	writes.POST("/rubbings", h.Rub)
	writes.POST("/rubbings/merge", h.MergeRubbings)
	writes.POST("/arrivals", h.Arrive)
	writes.PUT("/age-band", h.SetAgeBand)
	writes.POST("/tickets/:code/post", h.Publish)
	writes.DELETE("/tickets/:code/post", h.Unpublish)
	writes.POST("/lamps", h.LightLamp)
	writes.POST("/reports", h.Report)
	writes.PUT("/blocks/:aid", h.Block)
	writes.DELETE("/blocks/:aid", h.Block)

	admin := api.Group("/admin/road")
	admin.Use(middleware.JWTAuth(), middleware.RequireAdmin())
	admin.GET("/queue", h.Queue)
	admin.POST("/posts/:code", h.Review)
}

// ---------- cache ----------

// viewCache keeps public JSON for a short while. Any write bumps the generation, which makes
// every cached body stale at once.
type viewCache struct {
	mu    sync.Mutex
	gen   atomic.Uint64
	items map[string]cacheItem
	max   int
}

type cacheItem struct {
	body []byte
	exp  time.Time
	gen  uint64
}

func newViewCache(max int) *viewCache { return &viewCache{items: map[string]cacheItem{}, max: max} }

func (c *viewCache) generation() uint64 { return c.gen.Load() }

func (c *viewCache) bump() { c.gen.Add(1) }

func (c *viewCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	it, ok := c.items[key]
	if !ok || it.gen != c.gen.Load() || time.Now().After(it.exp) {
		return nil, false
	}
	return it.body, true
}

func (c *viewCache) put(key string, body []byte, gen uint64, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.items) >= c.max {
		now, cur := time.Now(), c.gen.Load()
		for k, it := range c.items {
			if it.gen != cur || now.After(it.exp) {
				delete(c.items, k)
			}
		}
		if len(c.items) >= c.max {
			c.items = map[string]cacheItem{}
		}
	}
	c.items[key] = cacheItem{body: body, exp: time.Now().Add(ttl), gen: gen}
}
