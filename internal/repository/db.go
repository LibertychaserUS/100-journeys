package repository

import (
	"database/sql"
	"embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql seed.sql
var sqlFiles embed.FS

func NewDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return db, nil
}

func Migrate(db *sql.DB) error {
	schema, err := sqlFiles.ReadFile("schema.sql")
	if err != nil {
		// Fallback: try reading from db/ directory
		return migrateFromFile(db, "db/schema.sql")
	}
	if _, err := db.Exec(string(schema)); err != nil {
		return fmt.Errorf("exec schema: %w", err)
	}
	return nil
}

func Seed(db *sql.DB) error {
	seed, err := sqlFiles.ReadFile("seed.sql")
	if err != nil {
		return seedFromFile(db, "db/seed.sql")
	}
	if _, err := db.Exec(string(seed)); err != nil {
		return fmt.Errorf("exec seed: %w", err)
	}
	return nil
}

func migrateFromFile(db *sql.DB, path string) error {
	schema, err := sqlFiles.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read schema file: %w", err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		return fmt.Errorf("exec schema: %w", err)
	}
	return nil
}

func seedFromFile(db *sql.DB, path string) error {
	seed, err := sqlFiles.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read seed file: %w", err)
	}
	if _, err := db.Exec(string(seed)); err != nil {
		return fmt.Errorf("exec seed: %w", err)
	}
	return nil
}
