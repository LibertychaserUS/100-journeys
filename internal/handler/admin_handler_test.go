package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"

	"database/sql"
	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/analytics"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func setupAdminTestRouter(t *testing.T) (*gin.Engine, repository.UserRepository, *sql.DB) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	userRepo := repository.NewUserRepository(db)
	journeyRepo := repository.NewJourneyRepository(db)
	adminRepo := repository.NewAdminRepository(db)
	adminH := NewAdminHandler(userRepo, journeyRepo, adminRepo)

	r := gin.New()
	api := r.Group("/api")
	AdminRoutes(api, adminH)
	return r, userRepo, db
}

func TestAdmin_Stats_AdminAccess(t *testing.T) {
	r, userRepo, _ := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("adminpass"), bcrypt.DefaultCost)
	admin := &model.User{Username: "admin", Email: "admin@example.com", PasswordHash: string(hash), Role: model.RoleAdmin, Level: 1}
	require.NoError(t, userRepo.Create(ctx, admin))

	token, _ := middleware.GenerateToken(admin)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdmin_Stats_UserForbidden(t *testing.T) {
	r, userRepo, _ := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("userpass"), bcrypt.DefaultCost)
	user := &model.User{Username: "regular", Email: "user@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	token, _ := middleware.GenerateToken(user)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdmin_Stats_NoToken(t *testing.T) {
	r, _, _ := setupAdminTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAdmin_Users_AdminAccess(t *testing.T) {
	r, userRepo, _ := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("adminpass"), bcrypt.DefaultCost)
	admin := &model.User{Username: "admin2", Email: "admin2@example.com", PasswordHash: string(hash), Role: model.RoleAdmin, Level: 1}
	require.NoError(t, userRepo.Create(ctx, admin))

	token, _ := middleware.GenerateToken(admin)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdmin_Stats_ReturnsRealDatabaseAggregates(t *testing.T) {
	r, userRepo, db := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("adminpass"), bcrypt.DefaultCost)
	admin := &model.User{
		Username:     "statsadmin",
		Email:        "statsadmin@example.com",
		PasswordHash: string(hash),
		Role:         model.RoleAdmin,
		Level:        3,
		Points:       100,
		Balance:      200,
		MBTIType:     "INTJ",
	}
	require.NoError(t, userRepo.Create(ctx, admin))

	user := &model.User{
		Username:     "statsuser",
		Email:        "statsuser@example.com",
		PasswordHash: string(hash),
		Role:         model.RoleUser,
		Level:        2,
		Points:       500,
		Balance:      1200,
		MBTIType:     "INFP",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	_, err := db.ExecContext(ctx,
		`INSERT INTO journeys (title, slug, story_hook, fantasy_type, visual_style, image_path, price)
		 VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
		"盐湖镜面信使", "bolivia-salt-flat-trek", "在天空倒影里递送一封没有地址的信", "visual", "surreal", "salt.jpg", 188,
		"火山暗河夜行", "lava-tube-night-walk", "沿着冷却的熔岩隧道寻找地下星图", "extreme", "dramatic", "lava.jpg", 288,
	)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx,
		`INSERT INTO analytics_events (event_type, journey_slug, user_id, mbti_type)
		 VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
		"journey_click", "bolivia-salt-flat-trek", user.ID, "INFP",
		"journey_click", "bolivia-salt-flat-trek", user.ID, "INFP",
		"pet_reply", "", user.ID, "INFP",
	)
	require.NoError(t, err)

	token, _ := middleware.GenerateToken(admin)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var body struct {
		Data map[string]interface{} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.EqualValues(t, 2, body.Data["total_users"])
	require.EqualValues(t, 2, body.Data["total_journeys"])
	require.EqualValues(t, 600, body.Data["total_points"])
	require.EqualValues(t, 1400, body.Data["total_balance"])

	topClicked, ok := body.Data["top_clicked_journeys"].([]interface{})
	require.True(t, ok)
	require.NotEmpty(t, topClicked)
	first := topClicked[0].(map[string]interface{})
	require.Equal(t, "bolivia-salt-flat-trek", first["slug"])
	require.EqualValues(t, 2, first["count"])
}

func TestAdmin_StatsAndExport_ReflectsFiftyVirtualUsersThroughHTTPBehavior(t *testing.T) {
	r, db, events := setupAdminFullStackTestRouter(t)

	journeys := []string{
		"bolivia-salt-flat-trek",
		"iceland-lava-tunnel-cycling",
		"japan-onsen-temple-meditation",
		"morocco-sahara-camel-camp",
		"greenland-dog-sled-solo",
	}
	genders := []string{"female", "male", "non_binary", "prefer_not_to_say"}
	mbtis := []string{"INFP", "INTJ", "ENFP", "ISFJ", "ENTP", "ISTJ", "INFJ", "ESTP"}

	adminTokens := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		email := fmt.Sprintf("admin-sim-%02d@example.com", i)
		token, userID := registerUserThroughHTTP(t, r, fmt.Sprintf("AdminSim%02d", i), email, genders[i%len(genders)])
		require.NotEmpty(t, token)
		setUserRoleAndMBTI(t, db, userID, model.RoleAdmin, mbtis[i%len(mbtis)], 7+i, 30000+i*1000)

		adminUser, err := repository.NewUserRepository(db).GetByID(t.Context(), userID)
		require.NoError(t, err)
		adminToken, err := middleware.GenerateToken(adminUser)
		require.NoError(t, err)
		adminTokens = append(adminTokens, adminToken)
	}
	require.Len(t, adminTokens, 3)

	expectedRevenue := 0
	expectedPurchaseGender := map[string]int{}
	expectedGender := map[string]int{}
	expectedMBTI := map[string]int{}
	expectedClicks := map[string]int{}
	expectedPurchases := map[string]int{}
	expectedAnalyticsEvents := 0
	expectedPoints := 0
	expectedBalance := 0

	for i := 0; i < 3; i++ {
		expectedGender[genders[i%len(genders)]]++
		expectedMBTI[mbtis[i%len(mbtis)]]++
		expectedPoints += 30000 + i*1000
	}

	for i := 0; i < 50; i++ {
		gender := genders[i%len(genders)]
		mbti := mbtis[i%len(mbtis)]
		points := 5000 + (i%5)*5000
		token, userID := registerUserThroughHTTP(t, r, fmt.Sprintf("VirtualUser%02d", i), fmt.Sprintf("virtual-user-%02d@example.com", i), gender)
		uploadAvatarThroughHTTP(t, r, token, i)
		setUserRoleAndMBTI(t, db, userID, model.RoleUser, mbti, 1+(i%10), points)
		expectedGender[gender]++
		expectedMBTI[mbti]++
		expectedPoints += points

		rechargeAmount := 90000 + i*137
		postJSON(t, r, "POST", "/api/payments/recharge", token, model.RechargeRequest{Amount: rechargeAmount}, http.StatusOK)
		expectedBalance += rechargeAmount

		slug := journeys[i%len(journeys)]
		quantity := 1 + (i % 3)
		orderData := postJSON(t, r, "POST", "/api/orders", token, model.CreateOrderRequest{
			Items: []model.CreateOrderItemRequest{{JourneySlug: slug, Quantity: quantity}},
		}, http.StatusCreated)
		orderID := int64(orderData["id"].(float64))
		orderTotal := int(orderData["total_amount"].(float64))
		expectedRevenue += orderTotal
		expectedBalance -= orderTotal
		expectedPurchaseGender[gender]++
		expectedPurchases[slug]++

		postJSON(t, r, "POST", fmt.Sprintf("/api/orders/%d/pay", orderID), token, nil, http.StatusOK)

		for click := 0; click < 1+(i%4); click++ {
			clickSlug := journeys[(i+click)%len(journeys)]
			postJSON(t, r, "POST", "/api/analytics/events", token, model.AnalyticsEventRequest{
				Type:        analytics.EventJourneyClick,
				JourneySlug: clickSlug,
				MBTIType:    mbti,
				Gender:      gender,
				Metadata:    fmt.Sprintf(`{"virtual_user":%d,"click":%d}`, i, click),
			}, http.StatusAccepted)
			expectedClicks[clickSlug]++
			expectedAnalyticsEvents++
		}
		postJSON(t, r, "POST", "/api/analytics/events", token, model.AnalyticsEventRequest{
			Type:     analytics.EventSearch,
			MBTIType: mbti,
			Gender:   gender,
			Metadata: fmt.Sprintf(`{"query":"route-%d"}`, i%7),
		}, http.StatusAccepted)
		expectedAnalyticsEvents++
	}

	require.NoError(t, events.Flush(context.Background()))

	statsData := getJSON(t, r, "/api/admin/stats", adminTokens[0], http.StatusOK)
	require.EqualValues(t, 53, statsData["total_users"])
	require.EqualValues(t, 50, statsData["total_orders"])
	require.EqualValues(t, 50, statsData["paid_orders"])
	require.EqualValues(t, expectedRevenue, statsData["gross_revenue"])
	require.EqualValues(t, expectedPoints, statsData["total_points"])
	require.EqualValues(t, expectedBalance, statsData["total_balance"])
	require.EqualValues(t, expectedAnalyticsEvents, statsData["analytics_events"])

	assertDistributionCounts(t, statsData["gender_distribution"], expectedGender)
	assertDistributionCounts(t, statsData["mbti_distribution"], expectedMBTI)
	assertDistributionCounts(t, statsData["purchase_gender_distribution"], expectedPurchaseGender)
	assertJourneyMetricCounts(t, statsData["top_clicked_journeys"], expectedClicks)
	assertJourneyMetricCounts(t, statsData["top_purchased_journeys"], expectedPurchases)
	assertTopPurchasedRates(t, statsData["top_purchased_journeys"])

	exportJSON := getJSON(t, r, "/api/admin/export?format=json", adminTokens[1], http.StatusOK)
	require.EqualValues(t, 53, exportJSON["total_users"])
	require.EqualValues(t, expectedRevenue, exportJSON["gross_revenue"])
	require.EqualValues(t, expectedPoints, exportJSON["total_points"])
	require.EqualValues(t, expectedBalance, exportJSON["total_balance"])

	csvBody := getRaw(t, r, "/api/admin/export?format=csv", adminTokens[2], http.StatusOK)
	require.Contains(t, csvBody, "total_users,53")
	require.Contains(t, csvBody, fmt.Sprintf("gross_revenue,%d", expectedRevenue))
	require.Contains(t, csvBody, fmt.Sprintf("total_points,%d", expectedPoints))
	require.Contains(t, csvBody, fmt.Sprintf("total_balance,%d", expectedBalance))
	require.Contains(t, csvBody, "gender:female")
	require.Contains(t, csvBody, "purchase_gender:male")
	require.Contains(t, csvBody, "top_clicked:bolivia-salt-flat-trek")
	require.Contains(t, csvBody, "top_purchased:iceland-lava-tunnel-cycling")
}

func setupAdminFullStackTestRouter(t *testing.T) (*gin.Engine, *sql.DB, *analytics.Buffer) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))
	require.NoError(t, repository.Seed(db, filepath.Join(projectRoot, "db/seed.sql")))

	journeyRepo := repository.NewJourneyRepository(db)
	userRepo := repository.NewUserRepository(db)
	adminRepo := repository.NewAdminRepository(db)
	orderRepo := repository.NewOrderRepository(db)
	txnRepo := repository.NewTransactionRepository(db)
	captchaStore := service.NewCaptchaStore()
	eventBuffer := analytics.NewBuffer(db, analytics.BufferOptions{Capacity: 1024, BatchSize: 128})
	t.Cleanup(func() { require.NoError(t, eventBuffer.Close(context.Background())) })

	media := &service.LocalProvider{BaseURL: "/static/assets/images"}
	journeySvc := service.NewJourneyService(journeyRepo, media)
	journeyH := NewJourneyHandler(journeySvc, ai.NewMockAI(), ai.NewRecommendEngine(journeyRepo), eventBuffer)
	authH := NewAuthHandler(userRepo, captchaStore, filepath.Join(t.TempDir(), "avatars"))
	adminH := NewAdminHandler(userRepo, journeyRepo, adminRepo)
	orderH := NewOrderHandler(orderRepo, journeyRepo, userRepo)
	paymentH := NewPaymentHandler(userRepo, txnRepo)
	captchaH := NewCaptchaHandler(captchaStore)

	r := gin.New()
	api := r.Group("/api")
	api.GET("/captcha", captchaH.Generate)
	api.POST("/auth/register", authH.Register)
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.POST("/avatar", authH.UploadAvatar)
	api.POST("/analytics/events", journeyH.TrackAnalytics)
	AdminRoutes(api, adminH)
	OrderRoutes(api, orderH)
	PaymentRoutes(api, paymentH)

	return r, db, eventBuffer
}

func uploadAvatarThroughHTTP(t *testing.T, r *gin.Engine, token string, index int) {
	t.Helper()
	png, err := base64.StdEncoding.DecodeString(onePixelPNGBase64)
	require.NoError(t, err)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", fmt.Sprintf("avatar-%02d.png", index))
	require.NoError(t, err)
	_, err = part.Write(png)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	w := httptest.NewRecorder()
	req, err := http.NewRequest(http.MethodPost, "/api/auth/avatar", &body)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
}

func registerUserThroughHTTP(t *testing.T, r *gin.Engine, username, email, gender string) (string, int64) {
	t.Helper()
	captcha := getJSON(t, r, "/api/captcha", "", http.StatusOK)
	captchaID := captcha["id"].(string)
	answer := solveCaptchaQuestion(t, captcha["question"].(string))

	data := postJSON(t, r, "POST", "/api/auth/register", "", model.RegisterRequest{
		Username:      username,
		Email:         email,
		Password:      "password123",
		Gender:        gender,
		CaptchaID:     captchaID,
		CaptchaAnswer: answer,
	}, http.StatusCreated)
	user := data["user"].(map[string]interface{})
	return data["token"].(string), int64(user["id"].(float64))
}

func setUserRoleAndMBTI(t *testing.T, db *sql.DB, userID int64, role, mbti string, level, points int) {
	t.Helper()
	_, err := db.ExecContext(t.Context(),
		`UPDATE users SET role = ?, mbti_type = ?, level = ?, points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		role, mbti, level, points, userID)
	require.NoError(t, err)
}

func getJSON(t *testing.T, r *gin.Engine, path, token string, wantStatus int) map[string]interface{} {
	t.Helper()
	w := httptest.NewRecorder()
	req, err := http.NewRequest("GET", path, nil)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	r.ServeHTTP(w, req)
	require.Equal(t, wantStatus, w.Code, w.Body.String())

	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	require.Nil(t, res["error"], w.Body.String())
	data, ok := res["data"].(map[string]interface{})
	require.True(t, ok, w.Body.String())
	return data
}

func postJSON(t *testing.T, r *gin.Engine, method, path, token string, payload interface{}, wantStatus int) map[string]interface{} {
	t.Helper()
	var body []byte
	var err error
	if payload != nil {
		body, err = json.Marshal(payload)
		require.NoError(t, err)
	}
	w := httptest.NewRecorder()
	req, err := http.NewRequest(method, path, bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	r.ServeHTTP(w, req)
	require.Equal(t, wantStatus, w.Code, w.Body.String())

	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	require.Nil(t, res["error"], w.Body.String())
	data, ok := res["data"].(map[string]interface{})
	require.True(t, ok, w.Body.String())
	return data
}

func getRaw(t *testing.T, r *gin.Engine, path, token string, wantStatus int) string {
	t.Helper()
	w := httptest.NewRecorder()
	req, err := http.NewRequest("GET", path, nil)
	require.NoError(t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	r.ServeHTTP(w, req)
	require.Equal(t, wantStatus, w.Code, w.Body.String())
	return w.Body.String()
}

var captchaQuestionRE = regexp.MustCompile(`^(\d+) ([+-]) (\d+) = \?$`)

func solveCaptchaQuestion(t *testing.T, question string) string {
	t.Helper()
	parts := captchaQuestionRE.FindStringSubmatch(question)
	require.Len(t, parts, 4, question)
	left, err := strconv.Atoi(parts[1])
	require.NoError(t, err)
	right, err := strconv.Atoi(parts[3])
	require.NoError(t, err)
	if parts[2] == "-" {
		return strconv.Itoa(left - right)
	}
	return strconv.Itoa(left + right)
}

func assertDistributionCounts(t *testing.T, raw interface{}, expected map[string]int) {
	t.Helper()
	got := map[string]int{}
	for _, item := range raw.([]interface{}) {
		row := item.(map[string]interface{})
		got[row["label"].(string)] = int(row["count"].(float64))
	}
	for label, count := range expected {
		require.Equalf(t, count, got[label], "distribution count for %s", label)
	}
}

func assertJourneyMetricCounts(t *testing.T, raw interface{}, expected map[string]int) {
	t.Helper()
	got := map[string]int{}
	for _, item := range raw.([]interface{}) {
		row := item.(map[string]interface{})
		got[row["slug"].(string)] = int(row["count"].(float64))
	}
	for slug, count := range expected {
		require.Equalf(t, count, got[slug], "journey metric count for %s", slug)
	}
}

func assertTopPurchasedRates(t *testing.T, raw interface{}) {
	t.Helper()
	for _, item := range raw.([]interface{}) {
		row := item.(map[string]interface{})
		rate, ok := row["rate"].(float64)
		require.True(t, ok, "purchase rate should be exported for %v", row["slug"])
		require.Greater(t, rate, 0.0)
	}
}

const onePixelPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw9Z5AAAAABJRU5ErkJggg=="
