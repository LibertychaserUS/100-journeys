package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

const (
	defaultUserEmail     = "demo-user@example.invalid"
	defaultAdminEmail    = "demo-admin@example.invalid"
	defaultUserPassword  = "LocalDemoUserChangeMe12345"
	defaultAdminPassword = "LocalDemoAdminChangeMe12345!"
)

type journeyLite struct {
	ID    int64
	Slug  string
	Title string
	Price int
}

type virtualProfile struct {
	Username string
	Email    string
	Gender   string
	MBTI     string
}

func main() {
	var (
		dbPath        = flag.String("db", "./data/app.db", "SQLite database path")
		schemaPath    = flag.String("schema", "./db/schema.sql", "schema.sql path")
		seedPath      = flag.String("seed", "./db/seed.sql", "seed.sql path")
		uploadDir     = flag.String("upload-dir", "./data/uploads", "upload directory used by the server")
		avatarAssets  = flag.String("avatar-assets", "./web/assets/images/avatars/github-default", "directory for generated GitHub-style default avatar assets")
		avatarURLBase = flag.String("avatar-url-base", "/static/assets/images/avatars/github-default", "public URL prefix for default avatar assets")
		userCount     = flag.Int("users", 50, "number of virtual ordinary users to create")
		adminCount    = flag.Int("admins", 3, "number of demo admin users to create")
		userEmail     = flag.String("user-email", envOrDefault("DEMO_USER_EMAIL", defaultUserEmail), "primary demo ordinary user email")
		adminEmail    = flag.String("admin-email", envOrDefault("DEMO_ADMIN_EMAIL", defaultAdminEmail), "primary demo admin email")
		userPassword  = flag.String("user-password", envOrDefault("DEMO_USER_PASSWORD", defaultUserPassword), "password for virtual ordinary users")
		adminPassword = flag.String("admin-password", envOrDefault("DEMO_ADMIN_PASSWORD", defaultAdminPassword), "password for demo admin users")
	)
	flag.Parse()

	if *userCount < 1 || *adminCount < 1 {
		log.Fatal("users and admins must both be greater than zero")
	}
	if len(*userPassword) < 8 || len(*adminPassword) < 12 {
		log.Fatal("user password must be >= 8 chars; admin password must be >= 12 chars")
	}
	if err := os.MkdirAll(filepath.Dir(*dbPath), 0755); err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(*uploadDir, "avatars"), 0755); err != nil {
		log.Fatal(err)
	}
	if err := ensureDefaultAvatarAssets(*avatarAssets); err != nil {
		log.Fatal(err)
	}

	db, err := repository.NewDB(*dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := repository.Migrate(db, *schemaPath); err != nil {
		log.Fatal(err)
	}
	if err := repository.Seed(db, *seedPath); err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	if err := resetDemoData(ctx, db, *userEmail, *adminEmail); err != nil {
		log.Fatal(err)
	}
	journeys, err := listJourneys(ctx, db)
	if err != nil {
		log.Fatal(err)
	}
	if len(journeys) == 0 {
		log.Fatal("no journeys found; run seed.sql first")
	}

	userHash, err := bcrypt.GenerateFromPassword([]byte(*userPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}
	adminHash, err := bcrypt.GenerateFromPassword([]byte(*adminPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	adminIDs, err := createAdmins(ctx, db, *avatarURLBase, *adminCount, *adminEmail, string(adminHash))
	if err != nil {
		log.Fatal(err)
	}
	userIDs, err := createVirtualUsers(ctx, db, *avatarURLBase, *userCount, *userEmail, string(userHash), journeys)
	if err != nil {
		log.Fatal(err)
	}
	if err := createAuditEvidence(ctx, db); err != nil {
		log.Fatal(err)
	}

	stats, err := summarize(ctx, db)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("demo data ready: users=%d admins=%d total_users=%d paid_orders=%d gross_revenue=%d analytics_events=%d audit_errors=%d\n",
		len(userIDs), len(adminIDs), stats.totalUsers, stats.paidOrders, stats.grossRevenue, stats.analyticsEvents, stats.auditErrors)
	fmt.Printf("admin login: %s / %s\n", *adminEmail, *adminPassword)
	fmt.Printf("user login: %s / %s\n", *userEmail, *userPassword)
	fmt.Printf("fixture admin login: demo-admin-01@example.com / %s\n", *adminPassword)
	fmt.Printf("fixture user login: demo-virtual-01@example.com / %s\n", *userPassword)
}

func envOrDefault(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

func resetDemoData(ctx context.Context, db *sql.DB, userEmail, adminEmail string) error {
	stmts := []struct {
		query string
		args  []interface{}
	}{
		{`DELETE FROM analytics_events WHERE metadata LIKE ?`, []interface{}{"%demo_fixture%"}},
		{`DELETE FROM audit_logs WHERE source = ?`, []interface{}{"demo-fixture"}},
		{`DELETE FROM users WHERE email LIKE ? OR email LIKE ?`, []interface{}{"demo-virtual-%@example.com", "demo-admin-%@example.com"}},
		{`DELETE FROM users WHERE email IN (?, ?, ?, ?)`, []interface{}{userEmail, adminEmail, "user@100journeys.demo", "admin@100journeys.demo"}},
	}
	for _, stmt := range stmts {
		if _, err := db.ExecContext(ctx, stmt.query, stmt.args...); err != nil {
			return err
		}
	}
	return nil
}

func listJourneys(ctx context.Context, db *sql.DB) ([]journeyLite, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, slug, title, price FROM journeys ORDER BY id LIMIT 12`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	journeys := []journeyLite{}
	for rows.Next() {
		var j journeyLite
		if err := rows.Scan(&j.ID, &j.Slug, &j.Title, &j.Price); err != nil {
			return nil, err
		}
		journeys = append(journeys, j)
	}
	return journeys, rows.Err()
}

func createAdmins(ctx context.Context, db *sql.DB, avatarURLBase string, count int, primaryEmail string, passwordHash string) ([]int64, error) {
	genders := []string{"female", "male", "non_binary", "prefer_not_to_say"}
	mbtis := []string{"INTJ", "ENTJ", "INFJ"}
	ids := make([]int64, 0, count)
	for i := 0; i < count; i++ {
		username := fmt.Sprintf("DemoAdmin%02d", i)
		email := fmt.Sprintf("demo-admin-%02d@example.com", i)
		if i == 0 {
			username = "桃源后台管理员"
			email = primaryEmail
		}
		res, err := db.ExecContext(ctx,
			`INSERT INTO users (username, email, password_hash, role, level, points, balance, mbti_type, gender)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			username,
			email,
			passwordHash,
			model.RoleAdmin,
			8+i%3,
			30000+i*1000,
			0,
			mbtis[i%len(mbtis)],
			genders[i%len(genders)],
		)
		if err != nil {
			return nil, err
		}
		id, _ := res.LastInsertId()
		if err := assignDefaultAvatar(ctx, db, avatarURLBase, id, i+8); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func createVirtualUsers(ctx context.Context, db *sql.DB, avatarURLBase string, count int, primaryEmail string, passwordHash string, journeys []journeyLite) ([]int64, error) {
	ids := make([]int64, 0, count)
	for i := 0; i < count; i++ {
		profile := profileFor(i, primaryEmail)
		points := 5000 + (i%5)*5000
		level := 1 + (i % 10)
		rechargeAmount := 90000 + i*137
		journey := journeys[i%len(journeys)]
		quantity := 1 + (i % 3)
		unitPrice := journey.Price * (100 - discountFor(points)) / 100
		total := unitPrice * quantity
		finalBalance := rechargeAmount - total

		res, err := db.ExecContext(ctx,
			`INSERT INTO users (username, email, password_hash, role, level, points, balance, mbti_type, gender)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			profile.Username,
			profile.Email,
			passwordHash,
			model.RoleUser,
			level,
			points,
			finalBalance,
			profile.MBTI,
			profile.Gender,
		)
		if err != nil {
			return nil, err
		}
		userID, _ := res.LastInsertId()
		if err := assignDefaultAvatar(ctx, db, avatarURLBase, userID, i); err != nil {
			return nil, err
		}
		if err := insertUserActivity(ctx, db, userID, points, rechargeAmount, finalBalance, journey, quantity, unitPrice, total, i); err != nil {
			return nil, err
		}
		if err := insertAnalytics(ctx, db, userID, profile.Gender, profile.MBTI, journeys, i); err != nil {
			return nil, err
		}
		ids = append(ids, userID)
	}
	return ids, nil
}

func profileFor(index int, primaryEmail string) virtualProfile {
	names := []string{
		"林见鹿", "周云澜", "陈听雪", "许南星", "沈知远",
		"顾清川", "宋月白", "陆闻舟", "何青岚", "叶星河",
		"赵望舒", "唐初晴", "韩沐野", "姜听雨", "秦照夜",
		"梁浅川", "苏予安", "程北辰", "孟夏栀", "余景行",
		"罗栖迟", "白若谷", "魏千帆", "丁晚照", "袁青梧",
		"曹星屿", "金云起", "邱知夏", "傅远山", "潘澄溪",
		"马听澜", "方鹿鸣", "蒋清和", "谢南舟", "萧若水",
		"邵明庭", "钟向晚", "贺云深", "任知微", "杜星眠",
		"夏临风", "黎安歌", "温初见", "严青霭", "石予舟",
		"尹落霞", "段长风", "高雪见", "蔡明河", "薛晚晴",
	}
	genders := []string{
		"female", "male", "prefer_not_to_say", "non_binary", "female",
		"male", "female", "prefer_not_to_say", "male", "female",
	}
	mbtis := []string{
		"INFP", "INTJ", "", "ISFJ", "ENTP",
		"ISTJ", "INFJ", "", "ESTP", "ENFP",
		"ISFP", "ENTJ", "ESFJ", "ISTP", "",
	}
	name := names[index%len(names)]
	emailStem := fmt.Sprintf("demo-virtual-%02d", index)
	if index == 0 {
		return virtualProfile{
			Username: "桃源试游用户",
			Email:    primaryEmail,
			Gender:   "prefer_not_to_say",
			MBTI:     "",
		}
	}
	return virtualProfile{
		Username: name,
		Email:    emailStem + "@example.com",
		Gender:   genders[index%len(genders)],
		MBTI:     mbtis[index%len(mbtis)],
	}
}

func discountFor(points int) int {
	switch {
	case points >= 100000:
		return 15
	case points >= 50000:
		return 12
	case points >= 20000:
		return 8
	case points >= 10000:
		return 5
	case points >= 5000:
		return 2
	default:
		return 0
	}
}

func insertUserActivity(ctx context.Context, db *sql.DB, userID int64, points, rechargeAmount, finalBalance int, journey journeyLite, quantity, unitPrice, total, index int) error {
	if _, err := db.ExecContext(ctx,
		`INSERT INTO user_points_history (user_id, action_type, points_delta, balance_after, description)
		 VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
		userID, "register", 100, points-100, "demo_fixture: 注册奖励",
		userID, "explore", points-(points-100), points, "demo_fixture: 浏览和分享奖励",
	); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx,
		`INSERT OR IGNORE INTO user_saved_journeys (user_id, journey_id) VALUES (?, ?)`,
		userID, journey.ID,
	); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO transactions (user_id, txn_type, amount, balance_after, description)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, model.TxnTypeRecharge, rechargeAmount, rechargeAmount, "demo_fixture: 充值",
	); err != nil {
		return err
	}
	orderNo := fmt.Sprintf("DEMO%s%04d", time.Now().Format("060102150405"), index)
	res, err := db.ExecContext(ctx,
		`INSERT INTO orders (order_no, user_id, status, total_amount, currency, paid_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		orderNo, userID, model.OrderStatusPaid, total, "WONDER",
	)
	if err != nil {
		return err
	}
	orderID, _ := res.LastInsertId()
	if _, err := db.ExecContext(ctx,
		`INSERT INTO order_items (order_id, journey_id, journey_title, unit_price, quantity, subtotal)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		orderID, journey.ID, journey.Title, unitPrice, quantity, total,
	); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO transactions (user_id, order_id, txn_type, amount, balance_after, description)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		userID, orderID, model.TxnTypePurchase, -total, finalBalance, "demo_fixture: 支付订单",
	); err != nil {
		return err
	}
	return nil
}

func insertAnalytics(ctx context.Context, db *sql.DB, userID int64, gender, mbti string, journeys []journeyLite, index int) error {
	for click := 0; click < 1+(index%4); click++ {
		journey := journeys[(index+click)%len(journeys)]
		if _, err := db.ExecContext(ctx,
			`INSERT INTO analytics_events (event_type, journey_slug, user_id, mbti_type, gender, metadata)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			"journey_click", journey.Slug, userID, mbti, gender, fmt.Sprintf(`{"demo_fixture":true,"virtual_user":%d,"click":%d}`, index, click),
		); err != nil {
			return err
		}
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO analytics_events (event_type, user_id, mbti_type, gender, metadata)
		 VALUES (?, ?, ?, ?, ?)`,
		"search", userID, mbti, gender, fmt.Sprintf(`{"demo_fixture":true,"query":"route-%d"}`, index%7),
	)
	return err
}

func createAuditEvidence(ctx context.Context, db *sql.DB) error {
	levels := []string{"info", "info", "info", "warn", "error"}
	for i := 0; i < 15; i++ {
		level := levels[i%len(levels)]
		status := 200
		if level == "warn" {
			status = 429
		}
		if level == "error" {
			status = 500
		}
		if _, err := db.ExecContext(ctx,
			`INSERT INTO audit_logs (request_id, level, source, method, path, status_code, latency_ms, message)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			fmt.Sprintf("demo-audit-%02d", i),
			level,
			"demo-fixture",
			"GET",
			"/api/demo-fixture",
			status,
			20+i,
			"demo_fixture: 后台审计样本",
		); err != nil {
			return err
		}
	}
	return nil
}

func assignDefaultAvatar(ctx context.Context, db *sql.DB, avatarURLBase string, userID int64, index int) error {
	avatarURL := fmt.Sprintf("%s/avatar-%02d.svg", strings.TrimRight(avatarURLBase, "/"), index%16)
	_, err := db.ExecContext(ctx, `UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, avatarURL, userID)
	return err
}

type statsSummary struct {
	totalUsers      int
	paidOrders      int
	grossRevenue    int
	analyticsEvents int
	auditErrors     int
}

func summarize(ctx context.Context, db *sql.DB) (statsSummary, error) {
	var s statsSummary
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&s.totalUsers); err != nil {
		return s, err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'paid'`).Scan(&s.paidOrders, &s.grossRevenue); err != nil {
		return s, err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_events`).Scan(&s.analyticsEvents); err != nil {
		return s, err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_logs WHERE level IN ('error', 'panic')`).Scan(&s.auditErrors); err != nil {
		return s, err
	}
	return s, nil
}

func ensureDefaultAvatarAssets(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	for i := 0; i < 16; i++ {
		path := filepath.Join(dir, fmt.Sprintf("avatar-%02d.svg", i))
		if err := os.WriteFile(path, []byte(defaultAvatarSVG(i)), 0644); err != nil {
			return err
		}
	}
	return nil
}

func defaultAvatarSVG(index int) string {
	palettes := [][3]string{
		{"#f0f6fc", "#54aeff", "#0969da"},
		{"#fff8c5", "#f2cc60", "#9a6700"},
		{"#ffebe9", "#ff8182", "#cf222e"},
		{"#dafbe1", "#56d364", "#1a7f37"},
		{"#fbefff", "#c297ff", "#8250df"},
		{"#ddf4ff", "#80ccff", "#0969da"},
		{"#fff1e5", "#ffa657", "#bc4c00"},
		{"#eaeef2", "#8c959f", "#57606a"},
	}
	p := palettes[index%len(palettes)]
	seed := uint32(2166136261 + index*16777619)
	cells := ""
	for y := 0; y < 5; y++ {
		rowBits := nextBits(&seed)
		for x := 0; x < 3; x++ {
			if rowBits&(1<<uint(x)) == 0 {
				continue
			}
			cells += svgRect(x, y, p[1])
			if x != 2 {
				cells += svgRect(4-x, y, p[2])
			}
		}
	}
	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="GitHub style default avatar"><rect width="80" height="80" rx="16" fill="%s"/><g transform="translate(12 12)">%s</g></svg>`, p[0], cells)
}

func nextBits(seed *uint32) uint32 {
	*seed ^= *seed << 13
	*seed ^= *seed >> 17
	*seed ^= *seed << 5
	return *seed
}

func svgRect(x, y int, color string) string {
	return fmt.Sprintf(`<rect x="%d" y="%d" width="11" height="11" rx="2" fill="%s"/>`, x*11+1, y*11+1, color)
}
