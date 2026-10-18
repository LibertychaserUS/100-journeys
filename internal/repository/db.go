package repository

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	_ "modernc.org/sqlite"
)

func NewDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// SQLite has a single-writer model. A single connection avoids write-lock
	// stampedes for P0 order/payment ledger transactions.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return db, nil
}

func Migrate(db *sql.DB, schemaPath string) error {
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("read schema.sql: %w", err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		return fmt.Errorf("exec schema: %w", err)
	}
	ctx := context.Background()
	if err := ensureColumn(ctx, db, "users", "gender", "TEXT NOT NULL DEFAULT 'prefer_not_to_say'"); err != nil {
		return err
	}
	if err := ensureDuplicateUsernamesAllowed(ctx, db); err != nil {
		return err
	}
	// The Ticket Road (v1.6.0): the age band declared at sign-up, accounts the station master
	// silenced, and the ticket a composition set out from.
	for _, col := range []struct{ table, name, def string }{
		{"users", "age_band", "TEXT NOT NULL DEFAULT ''"},
		{"users", "silenced_at", "DATETIME"},
		{"compositions", "parent_code", "TEXT NOT NULL DEFAULT ''"},
	} {
		if err := ensureColumn(ctx, db, col.table, col.name, col.def); err != nil {
			return err
		}
	}
	// v1.5.0 and v1.6.0 widened the analytics event CHECK; older databases rebuild the table to pick it up.
	rebuilt, err := ensureTableMatchesSchema(ctx, db, string(schema), "analytics_events", "'rack_view'")
	if err != nil {
		return err
	}
	if rebuilt {
		if _, err := db.Exec(string(schema)); err != nil { // recreate the table's indexes
			return fmt.Errorf("exec schema after rebuild: %w", err)
		}
	}
	return nil
}

// ensureTableMatchesSchema rebuilds table from its CREATE statement in schema when the live
// definition lacks marker (SQLite cannot alter a CHECK constraint in place). Rows are copied
// across for every column both definitions share.
func ensureTableMatchesSchema(ctx context.Context, db *sql.DB, schema, table, marker string) (bool, error) {
	if !isValidIdentifier(table) {
		return false, fmt.Errorf("invalid table identifier %q", table)
	}
	var current string
	if err := db.QueryRowContext(ctx, `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&current); err != nil {
		return false, fmt.Errorf("inspect table %s: %w", table, err)
	}
	if strings.Contains(current, marker) {
		return false, nil
	}
	head := "CREATE TABLE IF NOT EXISTS " + table + " ("
	start := strings.Index(schema, head)
	if start < 0 {
		return false, fmt.Errorf("schema has no CREATE statement for %s", table)
	}
	end := strings.Index(schema[start:], "\n);")
	if end < 0 {
		return false, fmt.Errorf("unterminated CREATE statement for %s", table)
	}
	tmp := table + "_rebuild"
	ddl := "CREATE TABLE " + quoteIdentifier(tmp) + " (" + schema[start+len(head):start+end] + "\n)"

	oldCols, err := tableColumns(ctx, db, table)
	if err != nil {
		return false, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, ddl); err != nil {
		return false, fmt.Errorf("create %s: %w", tmp, err)
	}
	newCols, err := tableColumns(ctx, tx, tmp)
	if err != nil {
		return false, err
	}
	var shared []string
	for _, c := range newCols {
		for _, o := range oldCols {
			if c == o {
				shared = append(shared, quoteIdentifier(c))
			}
		}
	}
	cols := strings.Join(shared, ", ")
	stmts := []string{
		fmt.Sprintf("INSERT INTO %s (%s) SELECT %s FROM %s", quoteIdentifier(tmp), cols, cols, quoteIdentifier(table)),
		"DROP TABLE " + quoteIdentifier(table),
		fmt.Sprintf("ALTER TABLE %s RENAME TO %s", quoteIdentifier(tmp), quoteIdentifier(table)),
	}
	for _, stmt := range stmts {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return false, fmt.Errorf("rebuild %s: %w", table, err)
		}
	}
	return true, tx.Commit()
}

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}

func tableColumns(ctx context.Context, q queryer, table string) ([]string, error) {
	rows, err := q.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", quoteIdentifier(table)))
	if err != nil {
		return nil, fmt.Errorf("inspect table %s: %w", table, err)
	}
	defer func() { _ = rows.Close() }()
	var cols []string
	for rows.Next() {
		var (
			cid       int
			name, typ string
			notNull   int
			dflt      sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, name)
	}
	return cols, rows.Err()
}

func Seed(db *sql.DB, seedPath string) error {
	seed, err := os.ReadFile(seedPath)
	if err != nil {
		return fmt.Errorf("read seed.sql: %w", err)
	}
	if _, err := db.Exec(string(seed)); err != nil {
		return fmt.Errorf("exec seed: %w", err)
	}
	return nil
}

func ensureColumn(ctx context.Context, db *sql.DB, table, column, definition string) error {
	if !isValidIdentifier(table) {
		return fmt.Errorf("invalid table identifier %q", table)
	}
	if !isValidIdentifier(column) {
		return fmt.Errorf("invalid column identifier %q", column)
	}
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", quoteIdentifier(table)))
	if err != nil {
		return fmt.Errorf("inspect table %s: %w", table, err)
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var defaultValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return fmt.Errorf("scan table info %s: %w", table, err)
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate table info %s: %w", table, err)
	}
	if _, err := db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", quoteIdentifier(table), quoteIdentifier(column), definition)); err != nil {
		return fmt.Errorf("add column %s.%s: %w", table, column, err)
	}
	return nil
}

func ensureDuplicateUsernamesAllowed(ctx context.Context, db *sql.DB) error {
	if !isValidIdentifier("users") {
		return fmt.Errorf("invalid table identifier %q", "users")
	}
	hasUniqueUsername, err := hasUniqueColumnIndex(ctx, db, "users", "username")
	if err != nil {
		return err
	}
	if !hasUniqueUsername {
		return nil
	}

	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
		return fmt.Errorf("disable foreign keys for users rebuild: %w", err)
	}
	defer func() {
		if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys=ON`); err != nil {
			fmt.Fprintf(os.Stderr, "warning: re-enable foreign keys: %v\n", err)
		}
	}()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err := tx.Rollback(); err != nil && err != sql.ErrTxDone {
			fmt.Fprintf(os.Stderr, "warning: rollback users rebuild: %v\n", err)
		}
	}()

	stmts := []string{
		`CREATE TABLE users_new (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			username        TEXT    NOT NULL,
			email           TEXT    NOT NULL UNIQUE,
			password_hash   TEXT    NOT NULL,
			role            TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
			level           INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 10),
			points          INTEGER NOT NULL DEFAULT 0,
			balance         INTEGER NOT NULL DEFAULT 0,
			mbti_type       TEXT,
			gender          TEXT    NOT NULL DEFAULT 'prefer_not_to_say' CHECK(gender IN ('female','male','non_binary','prefer_not_to_say')),
			avatar_url      TEXT,
			created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT INTO users_new (id, username, email, password_hash, role, level, points, balance, mbti_type, gender, avatar_url, created_at, updated_at)
		 SELECT id, username, email, password_hash, role, level, points, balance, mbti_type,
		        COALESCE(NULLIF(gender, ''), 'prefer_not_to_say'), avatar_url, created_at, updated_at
		   FROM users`,
		`DROP TABLE users`,
		`ALTER TABLE users_new RENAME TO users`,
		`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
	}
	for _, stmt := range stmts {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("rebuild users table: %w", err)
		}
	}
	return tx.Commit()
}

func hasUniqueColumnIndex(ctx context.Context, db *sql.DB, table, column string) (bool, error) {
	if !isValidIdentifier(table) {
		return false, fmt.Errorf("invalid table identifier %q", table)
	}
	if !isValidIdentifier(column) {
		return false, fmt.Errorf("invalid column identifier %q", column)
	}
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA index_list(%s)", quoteIdentifier(table)))
	if err != nil {
		return false, fmt.Errorf("list indexes %s: %w", table, err)
	}
	defer func() { _ = rows.Close() }()

	type indexInfo struct {
		name   string
		unique bool
	}
	var indexes []indexInfo
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return false, fmt.Errorf("scan index list %s: %w", table, err)
		}
		indexes = append(indexes, indexInfo{name: name, unique: unique == 1})
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterate index list %s: %w", table, err)
	}

	for _, idx := range indexes {
		if !idx.unique {
			continue
		}
		matches, columnCount, err := indexMatchesColumn(ctx, db, idx.name, column)
		if err != nil {
			return false, err
		}
		if matches && columnCount == 1 {
			return true, nil
		}
	}
	return false, nil
}

func indexMatchesColumn(ctx context.Context, db *sql.DB, indexName, column string) (bool, int, error) {
	if !isValidIdentifier(indexName) {
		return false, 0, fmt.Errorf("invalid index identifier %q", indexName)
	}
	infoRows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA index_info(%s)", quoteIdentifier(indexName)))
	if err != nil {
		return false, 0, fmt.Errorf("inspect index %s: %w", indexName, err)
	}

	matches := false
	columnCount := 0
	for infoRows.Next() {
		columnCount++
		var seqno, cid int
		var name string
		if err := infoRows.Scan(&seqno, &cid, &name); err != nil {
			if closeErr := infoRows.Close(); closeErr != nil {
				return false, 0, fmt.Errorf("close index info rows after scan error: %w", closeErr)
			}
			return false, 0, fmt.Errorf("scan index info %s: %w", indexName, err)
		}
		if name == column {
			matches = true
		}
	}
	if err := infoRows.Err(); err != nil {
		if closeErr := infoRows.Close(); closeErr != nil {
			return false, 0, fmt.Errorf("close index info rows after iteration error: %w", closeErr)
		}
		return false, 0, fmt.Errorf("iterate index info %s: %w", indexName, err)
	}
	if err := infoRows.Close(); err != nil {
		return false, 0, fmt.Errorf("close index info rows %s: %w", indexName, err)
	}
	return matches, columnCount, nil
}

func isValidIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func quoteIdentifier(value string) string {
	return `"` + value + `"`
}
