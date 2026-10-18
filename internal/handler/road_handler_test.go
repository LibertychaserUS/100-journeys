package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/road"
	"github.com/100-journeys/app/internal/road/light"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type roadRig struct {
	r       *gin.Engine
	captcha *service.CaptchaStore
	road    *RoadHandler
	clock   time.Time
	n       int
}

// setupRoadRig is the whole Ticket Road on an in-memory database, with a clock the test moves.
func setupRoadRig(t *testing.T) *roadRig {
	t.Helper()
	gin.SetMode(gin.TestMode)
	root, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, repository.Migrate(db, filepath.Join(root, "db/schema.sql")))
	require.NoError(t, repository.Seed(db, filepath.Join(root, "db/seed.sql")))
	require.NoError(t, content.Sync(context.Background(), db))

	written, err := compose.Load()
	require.NoError(t, err)
	entrances, err := content.Load()
	require.NoError(t, err)
	fragments := compose.Build(written, entrances)
	vocab, err := road.LoadVocab()
	require.NoError(t, err)
	cat := road.NewCatalog(fragments, entrances, vocab, middleware.DeriveKey("ticket-road/author"))

	userRepo := repository.NewUserRepository(db)
	svc := service.NewJourneyService(repository.NewJourneyRepository(db), &service.LocalProvider{BaseURL: "/static/assets/images"})
	captcha := service.NewCaptchaStore()
	comps := repository.NewCompositionRepository(db)
	rules := light.Defaults()
	rules.PostsPerDay = 100
	rh := NewRoadHandler(repository.NewRoadRepository(db), comps, cat, rules)
	rh.bucket = middleware.NewBucket(6000, 1000) // the per-account bucket has its own unit test
	rig := &roadRig{captcha: captcha, road: rh, clock: time.Now().UTC()}
	rh.SetClock(func() time.Time { return rig.clock })

	r := gin.New()
	api := r.Group("/api")
	api.POST("/auth/register", NewAuthHandler(userRepo, captcha, filepath.Join(t.TempDir(), "avatars")).Register)
	MeRoutes(api, NewMeHandler(userRepo, svc))
	ComposeRoutes(api, NewComposeHandler(comps, fragments, svc))
	RoadRoutes(api, rh)
	rig.r = r
	return rig
}

func (g *roadRig) register(t *testing.T, band string) (string, int64) {
	t.Helper()
	g.n++
	name := fmt.Sprintf("rider%d%d", g.n, time.Now().UnixNano()%100000)
	cid, _, ans := g.captcha.Generate()
	w, resp := doJSON(t, g.r, "POST", "/api/auth/register", "", model.RegisterRequest{Username: name, Email: name + "@example.com", Password: "password123", Gender: "prefer_not_to_say", AgeBand: band, CaptchaID: cid, CaptchaAnswer: ans})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	data := resp["data"].(map[string]interface{})
	return data["token"].(string), int64(data["user"].(map[string]interface{})["id"].(float64))
}

func (g *roadRig) do(t *testing.T, method, path, token string, body interface{}) (int, map[string]interface{}) {
	t.Helper()
	w, resp := doJSON(t, g.r, method, path, token, body)
	return w.Code, resp
}

func (g *roadRig) keep(t *testing.T, token, id string, picks map[string]string, parent string) string {
	t.Helper()
	code, resp := g.do(t, "POST", "/api/auth/compositions", token, map[string]interface{}{"id": id, "picks": picks, "parent_code": parent})
	require.Contains(t, []int{http.StatusCreated, http.StatusOK}, code, resp)
	return resp["data"].(map[string]interface{})["code"].(string)
}

func (g *roadRig) station(t *testing.T, query string) []map[string]interface{} {
	t.Helper()
	code, resp := g.do(t, "GET", "/api/station?"+query, "", nil)
	require.Equal(t, http.StatusOK, code, resp)
	var out []map[string]interface{}
	for _, it := range resp["data"].(map[string]interface{})["items"].([]interface{}) {
		out = append(out, it.(map[string]interface{}))
	}
	return out
}

func codes(items []map[string]interface{}) []string {
	out := []string{}
	for _, it := range items {
		out = append(out, it["code"].(string))
	}
	return out
}

// IT-API-ROAD-001: rubbing a door hands out its place, hour, season and the picked keepsake; a
// ticket of those slips posted to the station carries postmarks, a transfer stamp, an alias and
// its tags, and is found by filters, by search (trigram and short words) and on the door's rack.
func TestRoad_RubPostAndFind(t *testing.T) {
	g := setupRoadRig(t)
	author, _ := g.register(t, "18+")

	code, resp := g.do(t, "PUT", "/api/auth/choices/bolivia-salt-flat-trek", author, map[string]string{"key": "postcard"})
	require.Equal(t, http.StatusOK, code, resp)
	code, resp = g.do(t, "POST", "/api/auth/rubbings", author, map[string]string{"slug": "bolivia-salt-flat-trek"})
	require.Equal(t, http.StatusOK, code, resp)
	rub := resp["data"].(map[string]interface{})
	assert.ElementsMatch(t, []interface{}{"place:uyuni", "hour:predawn", "season:rainy", "keepsake:keep-1-postcard"}, rub["rubbed"])
	assert.Len(t, rub["fresh"], 4)
	code, resp = g.do(t, "POST", "/api/auth/rubbings", author, map[string]string{"slug": "japan-onsen-temple-meditation", "option": "egg"})
	require.Equal(t, http.StatusOK, code, resp)
	assert.ElementsMatch(t, []interface{}{"place:koyasan", "season:winter", "keepsake:keep-3-egg"}, resp["data"].(map[string]interface{})["fresh"], "predawn was already rubbed at door 1")

	// A guest's rubbings merge, but only slips the named door hands out.
	code, resp = g.do(t, "POST", "/api/auth/rubbings/merge", author, map[string]interface{}{"rubbings": map[string]string{"keepsake:keep-6-pencil": "norway-aurora-hunt", "keepsake:keep-6-gloves": "bolivia-salt-flat-trek"}})
	require.Equal(t, http.StatusOK, code, resp)
	assert.Equal(t, float64(1), resp["data"].(map[string]interface{})["added"])
	assert.Equal(t, []interface{}{"keepsake:keep-6-gloves"}, resp["data"].(map[string]interface{})["skipped"])

	picks := map[string]string{"place": "uyuni", "hour": "predawn", "season": "rainy", "stay": "day", "ritual": "barefoot", "keepsake": "keep-6-pencil"}
	share := g.keep(t, author, "ticket-road-0001", picks, "")
	code, resp = g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{"tags": []string{"barefoot", "quiet"}})
	require.Equal(t, http.StatusCreated, code, resp)
	posted := resp["data"].(map[string]interface{})
	assert.Equal(t, map[string]interface{}{"place": float64(1), "hour": float64(1), "season": float64(1), "keepsake": float64(6)}, posted["marks"])
	assert.Equal(t, true, posted["transfer"], "borrowed from two doors")
	assert.Regexp(t, `^找镜子的人 · \d{4}$`, posted["alias"])
	assert.Equal(t, true, posted["mine"])
	assert.Nil(t, posted["light"].(map[string]interface{})["glow"], "no light before five travellers")

	// Posting again only updates tags; editing a posted ticket is refused.
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{"tags": []string{"barefoot"}})
	assert.Equal(t, http.StatusOK, code)
	code, _ = g.do(t, "POST", "/api/auth/compositions", author, map[string]interface{}{"id": "ticket-road-0001", "picks": map[string]string{"place": "tromso"}})
	assert.Equal(t, http.StatusConflict, code)

	g.clock = g.clock.Add(time.Minute)
	other := g.keep(t, author, "ticket-road-0002", map[string]string{"place": "tromso", "hour": "night", "season": "polar-night", "stay": "hour"}, "")
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+other+"/post", author, map[string]interface{}{"tags": []string{"aurora"}})
	require.Equal(t, http.StatusCreated, code)

	assert.Equal(t, []string{share}, codes(g.station(t, "realm=mirror-salt")))
	assert.Equal(t, []string{other}, codes(g.station(t, "hour=night")))
	assert.Equal(t, []string{share}, codes(g.station(t, "tag=barefoot")))
	assert.Equal(t, []string{share}, codes(g.station(t, "place=uyuni&season=rainy")))
	assert.Equal(t, []string{share}, codes(g.station(t, "q="+url.QueryEscape("赤脚 雨季"))), "short words fall back to LIKE")
	assert.Equal(t, []string{share}, codes(g.station(t, "q="+url.QueryEscape("乌尤尼"))), "three characters use the trigram index")
	assert.Equal(t, []string{other}, codes(g.station(t, "q=polar")))
	assert.Empty(t, g.station(t, "q=nowhere"))
	assert.Equal(t, []string{other, share}, codes(g.station(t, "sort=new")))

	code, resp = g.do(t, "GET", "/api/station/tickets/"+share+"?lang=en", "", nil)
	require.Equal(t, http.StatusOK, code)
	assert.Regexp(t, `^The mirror finder · \d{4}$`, resp["data"].(map[string]interface{})["alias"])
	assert.Nil(t, resp["data"].(map[string]interface{})["mine"])

	code, resp = g.do(t, "GET", "/api/entrances/norway-aurora-hunt/rack?hour=night", "", nil)
	require.Equal(t, http.StatusOK, code)
	rack := resp["data"].([]interface{})
	require.Len(t, rack, 1, "both tickets borrowed from door 6, but one author hangs one ticket on a rack")
	assert.Equal(t, other, rack[0].(map[string]interface{})["code"], "the ticket of the viewer's hour comes first")
	assert.Equal(t, true, rack[0].(map[string]interface{})["open_now"])
	code, resp = g.do(t, "GET", "/api/entrances/norway-aurora-hunt/rack?hour=predawn", "", nil)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, share, resp["data"].([]interface{})[0].(map[string]interface{})["code"], "another hour, another ticket")
	code, resp = g.do(t, "GET", "/api/entrances/bolivia-salt-flat-trek/rack", "", nil)
	require.Equal(t, http.StatusOK, code)
	assert.Len(t, resp["data"], 1)

	code, resp = g.do(t, "GET", "/api/space/INFP/drifted", "", nil)
	require.Equal(t, http.StatusOK, code)
	assert.NotEmpty(t, resp["data"], "door 1 is written for this type")

	// Taking it down removes it from the station and the racks.
	code, _ = g.do(t, "DELETE", "/api/auth/tickets/"+other+"/post", author, nil)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, []string{share}, codes(g.station(t, "")))
}

// IT-API-ROAD-002: the station pages by carriages of 24 with a keyset cursor, in every order.
func TestRoad_StationPaging(t *testing.T) {
	g := setupRoadRig(t)
	author, _ := g.register(t, "18+")
	places := []string{"uyuni", "koyasan", "tromso", "milford", "merzouga", "inca-trail", "back-alley", "last-train"}
	var all []string
	for i := 0; i < 30; i++ {
		share := g.keep(t, author, fmt.Sprintf("paging-ticket-%02d", i), map[string]string{"place": places[i%len(places)], "stay": "day", "ritual": "quiet"}, "")
		code, resp := g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{})
		require.Equal(t, http.StatusCreated, code, resp)
		all = append(all, share)
		g.clock = g.clock.Add(time.Second)
	}
	for _, sort := range []string{"new", "bright", "borrowed"} {
		code, resp := g.do(t, "GET", "/api/station?sort="+sort, "", nil)
		require.Equal(t, http.StatusOK, code)
		page := resp["data"].(map[string]interface{})
		first := page["items"].([]interface{})
		require.Len(t, first, 24, sort)
		next := page["next"].(string)
		require.NotEmpty(t, next, sort)
		code, resp = g.do(t, "GET", "/api/station?sort="+sort+"&cursor="+next, "", nil)
		require.Equal(t, http.StatusOK, code)
		page = resp["data"].(map[string]interface{})
		second := page["items"].([]interface{})
		require.Len(t, second, 6, sort)
		assert.Empty(t, page["next"], sort)
		seen := map[string]bool{}
		for _, it := range append(first, second...) {
			seen[it.(map[string]interface{})["code"].(string)] = true
		}
		assert.Len(t, seen, 30, "no ticket twice, none missing (%s)", sort)
	}
	code, _ := g.do(t, "GET", "/api/station?cursor=bogus", "", nil)
	assert.Equal(t, http.StatusBadRequest, code)
	code, _ = g.do(t, "GET", "/api/station?realm=moon", "", nil)
	assert.Equal(t, http.StatusBadRequest, code)
}

// IT-API-ROAD-003: lamps need an arrival, refuse your own ticket, weigh only for accounts that are
// old enough and have read a journey through, stay hidden until five travellers, and adjust.
func TestRoad_Lamps(t *testing.T) {
	g := setupRoadRig(t)
	author, _ := g.register(t, "18+")
	share := g.keep(t, author, "lamp-ticket-0001", map[string]string{"place": "uyuni", "hour": "predawn", "stay": "day"}, "")
	code, _ := g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{})
	require.Equal(t, http.StatusCreated, code)

	lamp := map[string]interface{}{"kind": "ticket", "id": share, "real": 5, "moved": 4, "fit": 5, "stamp": "stopped", "flags": []string{"hour"}}
	code, _ = g.do(t, "POST", "/api/auth/lamps", author, lamp)
	assert.Equal(t, http.StatusForbidden, code, "never on your own ticket")

	var riders []string
	for i := 0; i < 5; i++ {
		tok, _ := g.register(t, "18+")
		riders = append(riders, tok)
	}
	code, resp := g.do(t, "POST", "/api/auth/lamps", riders[0], lamp)
	assert.Equal(t, http.StatusConflict, code, "not arrived: the back was never turned over")
	assert.Equal(t, "not arrived", resp["error"])
	code, _ = g.do(t, "POST", "/api/auth/arrivals", riders[0], map[string]string{"kind": "ticket", "id": share, "step": "view"})
	require.Equal(t, http.StatusOK, code)
	code, resp = g.do(t, "POST", "/api/auth/lamps", riders[0], lamp)
	assert.Equal(t, http.StatusConflict, code, "eight seconds on the back first")
	assert.Equal(t, float64(8), resp["data"].(map[string]interface{})["wait_s"])

	g.clock = g.clock.Add(9 * time.Second)
	code, resp = g.do(t, "POST", "/api/auth/lamps", riders[0], lamp)
	require.Equal(t, http.StatusOK, code, resp)
	_, resp = g.do(t, "GET", "/api/lamps/ticket/"+share, "", nil)
	assert.Nil(t, resp["data"].(map[string]interface{})["count"], "a new account's lamp does not weigh yet")

	// Four days later every rider has read door 1 through and lights the ticket.
	g.clock = g.clock.Add(96 * time.Hour)
	for _, tok := range riders {
		_, _ = g.do(t, "POST", "/api/auth/arrivals", tok, map[string]string{"kind": "journey", "id": "bolivia-salt-flat-trek", "step": "view"})
	}
	g.clock = g.clock.Add(10 * time.Minute)
	for i, tok := range riders {
		_, _ = g.do(t, "POST", "/api/auth/arrivals", tok, map[string]string{"kind": "journey", "id": "bolivia-salt-flat-trek", "step": "end"})
		_, _ = g.do(t, "POST", "/api/auth/arrivals", tok, map[string]string{"kind": "ticket", "id": share, "step": "view"})
		g.clock = g.clock.Add(9 * time.Second)
		code, resp = g.do(t, "POST", "/api/auth/lamps", tok, lamp)
		require.Equal(t, http.StatusOK, code, "rider %d: %v", i, resp)
		light := resp["data"].(map[string]interface{})["light"].(map[string]interface{})
		if i < 4 {
			assert.Nil(t, light["glow"], "rider %d: still hidden", i)
		} else {
			assert.Equal(t, float64(5), light["count"])
			assert.NotNil(t, light["glow"])
			assert.Equal(t, []interface{}{"stopped"}, light["top_stamps"])
		}
	}
	// The journey itself can be lit by someone who read it.
	code, resp = g.do(t, "POST", "/api/auth/lamps", riders[0], map[string]interface{}{"kind": "journey", "id": "bolivia-salt-flat-trek", "moved": 5})
	require.Equal(t, http.StatusOK, code, resp)
	code, resp = g.do(t, "POST", "/api/auth/lamps", riders[1], map[string]interface{}{"kind": "journey", "id": "norway-aurora-hunt", "moved": 5})
	assert.Equal(t, http.StatusConflict, code, "never opened door 6")
	assert.Equal(t, float64(-1), resp["data"].(map[string]interface{})["wait_s"])

	code, resp = g.do(t, "GET", "/api/auth/lamps/ticket/"+share, riders[0], nil)
	require.Equal(t, http.StatusOK, code)
	mine := resp["data"].(map[string]interface{})["mine"].(map[string]interface{})
	assert.Equal(t, float64(5), mine["real"])
	assert.Equal(t, []interface{}{"hour"}, mine["flags"], "flags come back only to their sender")

	code, resp = g.do(t, "GET", "/api/auth/ledger/ticket/"+share, author, nil)
	require.Equal(t, http.StatusOK, code)
	ledger := resp["data"].(map[string]interface{})
	assert.Equal(t, true, ledger["ready"])
	assert.Equal(t, float64(5), ledger["ledger"].(map[string]interface{})["flags"].(map[string]interface{})["hour"])
	code, _ = g.do(t, "GET", "/api/auth/ledger/ticket/"+share, riders[0], nil)
	assert.Equal(t, http.StatusForbidden, code)

	// The nightly pass keeps the same light, and "bright" now orders this ticket first.
	require.NoError(t, g.road.repo.Recompute(context.Background(), g.road.rules, g.clock))
	other := g.keep(t, author, "lamp-ticket-0002", map[string]string{"place": "tromso", "hour": "night", "stay": "day"}, "")
	_, _ = g.do(t, "POST", "/api/auth/tickets/"+other+"/post", author, map[string]interface{}{})
	assert.Equal(t, []string{share, other}, codes(g.station(t, "sort=bright")))

	code, _ = g.do(t, "POST", "/api/auth/lamps", riders[1], map[string]interface{}{"kind": "ticket", "id": share})
	assert.Equal(t, http.StatusBadRequest, code, "a lamp needs a wick or a stamp")
	code, _ = g.do(t, "POST", "/api/auth/lamps", riders[1], map[string]interface{}{"kind": "ticket", "id": share, "real": 6})
	assert.Equal(t, http.StatusBadRequest, code)
	code, _ = g.do(t, "POST", "/api/auth/lamps", riders[1], map[string]interface{}{"kind": "ticket", "id": share, "stamp": "free text"})
	assert.Equal(t, http.StatusBadRequest, code)
}

// IT-API-ROAD-004: three trusted reporters dim a ticket; the station master restores or removes
// it; a blocked author disappears from the station for the blocker only; age bands gate posting.
func TestRoad_Safety(t *testing.T) {
	g := setupRoadRig(t)
	author, authorID := g.register(t, "18+")
	share := g.keep(t, author, "safety-ticket-01", map[string]string{"place": "uyuni", "hour": "predawn", "stay": "day"}, "")
	code, _ := g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{})
	require.Equal(t, http.StatusCreated, code)

	young, _ := g.register(t, "under14")
	ys := g.keep(t, young, "young-ticket-001", map[string]string{"place": "uyuni", "hour": "predawn", "stay": "day"}, "")
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+ys+"/post", young, map[string]interface{}{})
	assert.Equal(t, http.StatusForbidden, code, "under 14 keeps tickets private")
	unknown, _ := g.register(t, "")
	us := g.keep(t, unknown, "older-ticket-001", map[string]string{"place": "uyuni", "hour": "predawn", "stay": "day"}, "")
	code, resp := g.do(t, "POST", "/api/auth/tickets/"+us+"/post", unknown, map[string]interface{}{})
	assert.Equal(t, http.StatusConflict, code)
	assert.Equal(t, "age band needed", resp["error"])
	code, _ = g.do(t, "PUT", "/api/auth/age-band", unknown, map[string]string{"age_band": "14-17"})
	require.Equal(t, http.StatusOK, code)
	code, _ = g.do(t, "PUT", "/api/auth/age-band", unknown, map[string]string{"age_band": "18+"})
	assert.Equal(t, http.StatusConflict, code, "declared once")
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+us+"/post", unknown, map[string]interface{}{"tags": []string{"quiet"}})
	assert.Equal(t, http.StatusCreated, code, "14-17 may post with printed tags")
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+us+"/post", unknown, map[string]interface{}{"tags": []string{"my own words"}})
	assert.Equal(t, http.StatusBadRequest, code, "no handwritten tags")

	// Blocking: the blocker no longer sees the author; others still do.
	viewerTok, _ := g.register(t, "18+")
	_, resp = g.do(t, "GET", "/api/station/tickets/"+share, "", nil)
	aid := resp["data"].(map[string]interface{})["aid"].(string)
	code, _ = g.do(t, "PUT", "/api/auth/blocks/"+aid, viewerTok, nil)
	require.Equal(t, http.StatusOK, code)
	code, resp = g.do(t, "GET", "/api/station", viewerTok, nil)
	require.Equal(t, http.StatusOK, code)
	for _, it := range resp["data"].(map[string]interface{})["items"].([]interface{}) {
		assert.NotEqual(t, share, it.(map[string]interface{})["code"])
	}
	assert.Contains(t, codes(g.station(t, "")), share)

	// Reports: new accounts are heard but do not dim; three trusted ones do.
	var reporters []string
	for i := 0; i < 3; i++ {
		tok, _ := g.register(t, "18+")
		reporters = append(reporters, tok)
	}
	code, _ = g.do(t, "POST", "/api/auth/reports", reporters[0], map[string]string{"kind": "ticket", "id": share, "reason": "wrong"})
	require.Equal(t, http.StatusOK, code)
	code, _ = g.do(t, "POST", "/api/auth/reports", author, map[string]string{"kind": "ticket", "id": share, "reason": "wrong"})
	assert.Equal(t, http.StatusForbidden, code)
	code, _ = g.do(t, "POST", "/api/auth/reports", reporters[0], map[string]string{"kind": "ticket", "id": share, "reason": "free text"})
	assert.Equal(t, http.StatusBadRequest, code)
	g.clock = g.clock.Add(96 * time.Hour)
	for _, tok := range reporters {
		code, _ = g.do(t, "POST", "/api/auth/reports", tok, map[string]string{"kind": "ticket", "id": share, "reason": "unsafe"})
		require.Equal(t, http.StatusOK, code)
	}
	assert.NotContains(t, codes(g.station(t, "")), share, "dimmed until review")
	code, _ = g.do(t, "GET", "/api/station/tickets/"+share, "", nil)
	assert.Equal(t, http.StatusNotFound, code)
	code, resp = g.do(t, "GET", "/api/station/tickets/"+share, author, nil)
	require.Equal(t, http.StatusOK, code, "the author still sees their dimmed ticket")
	assert.Equal(t, "hidden", resp["data"].(map[string]interface{})["status"])

	admin, err := middleware.GenerateToken(&model.User{ID: authorID + 1000, Role: model.RoleAdmin})
	require.NoError(t, err)
	code, resp = g.do(t, "GET", "/api/admin/road/queue", admin, nil)
	require.Equal(t, http.StatusOK, code)
	queue := resp["data"].([]interface{})
	require.NotEmpty(t, queue)
	first := queue[0].(map[string]interface{})
	assert.Equal(t, "hidden", first["status"])
	assert.Equal(t, float64(3), first["trusted"])
	code, _ = g.do(t, "GET", "/api/admin/road/queue", author, nil)
	assert.Equal(t, http.StatusForbidden, code)

	code, _ = g.do(t, "POST", "/api/admin/road/posts/"+share, admin, map[string]string{"action": "restore"})
	require.Equal(t, http.StatusOK, code)
	assert.Contains(t, codes(g.station(t, "")), share)
	code, _ = g.do(t, "POST", "/api/admin/road/posts/"+share, admin, map[string]string{"action": "remove"})
	require.Equal(t, http.StatusOK, code)
	assert.NotContains(t, codes(g.station(t, "")), share)
	code, _ = g.do(t, "DELETE", "/api/auth/tickets/"+share+"/post", author, nil)
	assert.Equal(t, http.StatusNotFound, code, "a removed ticket stays down")
	code, _ = g.do(t, "POST", "/api/auth/tickets/"+share+"/post", author, map[string]interface{}{})
	assert.Equal(t, http.StatusForbidden, code)
}

// IT-API-ROAD-005: setting out from someone's ticket counts once per traveller and orders
// "often borrowed"; your own ticket does not count.
func TestRoad_Borrowed(t *testing.T) {
	g := setupRoadRig(t)
	author, _ := g.register(t, "18+")
	a := g.keep(t, author, "borrow-ticket-a1", map[string]string{"place": "uyuni", "hour": "predawn", "stay": "day"}, "")
	b := g.keep(t, author, "borrow-ticket-b1", map[string]string{"place": "tromso", "hour": "night", "stay": "day"}, "")
	for _, c := range []string{a, b} {
		code, _ := g.do(t, "POST", "/api/auth/tickets/"+c+"/post", author, map[string]interface{}{})
		require.Equal(t, http.StatusCreated, code)
	}
	g.keep(t, author, "borrow-own-0001", map[string]string{"place": "uyuni"}, a)
	other, _ := g.register(t, "18+")
	g.keep(t, other, "borrow-copy-0001", map[string]string{"place": "uyuni"}, a)
	g.keep(t, other, "borrow-copy-0002", map[string]string{"place": "uyuni", "stay": "hour"}, a)
	assert.Equal(t, []string{a, b}, codes(g.station(t, "sort=borrowed")))

	code, resp := g.do(t, "GET", "/api/auth/compositions", other, nil)
	require.Equal(t, http.StatusOK, code)
	var parents []interface{}
	for _, it := range resp["data"].([]interface{}) {
		parents = append(parents, it.(map[string]interface{})["parent_code"])
	}
	assert.Equal(t, []interface{}{a, a}, parents)
	raw, _ := json.Marshal(resp)
	assert.NotContains(t, string(raw), "author_hash")
}
