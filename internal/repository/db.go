package repository

import (
	"database/sql"
	"fmt"
	"os"

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
	if err := ensureColumn(db, "users", "gender", "TEXT NOT NULL DEFAULT 'prefer_not_to_say'"); err != nil {
		return err
	}
	if err := ensureDuplicateUsernamesAllowed(db); err != nil {
		return err
	}
	return nil
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

func ensureColumn(db *sql.DB, table, column, definition string) error {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return fmt.Errorf("inspect table %s: %w", table, err)
	}
	defer rows.Close()

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
	if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)); err != nil {
		return fmt.Errorf("add column %s.%s: %w", table, column, err)
	}
	return nil
}

func ensureDuplicateUsernamesAllowed(db *sql.DB) error {
	hasUniqueUsername, err := hasUniqueColumnIndex(db, "users", "username")
	if err != nil {
		return err
	}
	if !hasUniqueUsername {
		return nil
	}

	if _, err := db.Exec(`PRAGMA foreign_keys=OFF`); err != nil {
		return fmt.Errorf("disable foreign keys for users rebuild: %w", err)
	}
	defer db.Exec(`PRAGMA foreign_keys=ON`)

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

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
		if _, err := tx.Exec(stmt); err != nil {
			return fmt.Errorf("rebuild users table: %w", err)
		}
	}
	return tx.Commit()
}

func hasUniqueColumnIndex(db *sql.DB, table, column string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_list(%s)", table))
	if err != nil {
		return false, fmt.Errorf("list indexes %s: %w", table, err)
	}
	defer rows.Close()

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
		return false, err
	}

	for _, idx := range indexes {
		if !idx.unique {
			continue
		}
		infoRows, err := db.Query(fmt.Sprintf("PRAGMA index_info(%s)", idx.name))
		if err != nil {
			return false, fmt.Errorf("inspect index %s: %w", idx.name, err)
		}
		matches := false
		columnCount := 0
		for infoRows.Next() {
			columnCount++
			var seqno, cid int
			var name string
			if err := infoRows.Scan(&seqno, &cid, &name); err != nil {
				infoRows.Close()
				return false, fmt.Errorf("scan index info %s: %w", idx.name, err)
			}
			if name == column {
				matches = true
			}
		}
		infoRows.Close()
		if matches && columnCount == 1 {
			return true, nil
		}
	}
	return false, nil
}
