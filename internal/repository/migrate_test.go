package repository

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// UT-REPO-MIGRATE-001: a database created before v1.5.0 gets the wider analytics CHECK on
// Migrate, keeps its rows and indexes, and a second Migrate is a no-op.
func TestMigrate_RebuildsAnalyticsEvents(t *testing.T) {
	ctx := context.Background()
	root, _ := filepath.Abs("../..")
	schemaPath := filepath.Join(root, "db/schema.sql")
	raw, err := os.ReadFile(schemaPath)
	require.NoError(t, err)

	// Recreate the old definition: same schema, the original five event types.
	start := strings.Index(string(raw), "    event_type      TEXT    NOT NULL CHECK(event_type IN (")
	end := strings.Index(string(raw)[start:], ")),\n")
	require.True(t, start > 0 && end > 0)
	old := string(raw)[:start] +
		"    event_type      TEXT    NOT NULL CHECK(event_type IN ('journey_view', 'journey_click', 'pet_reply', 'search', 'filter')),\n" +
		string(raw)[start+end+len(")),\n"):]
	oldPath := filepath.Join(t.TempDir(), "schema-old.sql")
	require.NoError(t, os.WriteFile(oldPath, []byte(old), 0o600))

	db, err := NewDB(filepath.Join(t.TempDir(), "app.db"))
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, Migrate(db, oldPath))
	_, err = db.ExecContext(ctx, `INSERT INTO analytics_events (event_type, journey_slug) VALUES ('space_enter', '')`)
	require.Error(t, err, "old CHECK should reject new event types")
	_, err = db.ExecContext(ctx, `INSERT INTO analytics_events (event_type, journey_slug, metadata) VALUES ('journey_view', 'a', 'kept')`)
	require.NoError(t, err)

	require.NoError(t, Migrate(db, schemaPath))
	_, err = db.ExecContext(ctx, `INSERT INTO analytics_events (event_type, journey_slug) VALUES ('space_enter', '')`)
	require.NoError(t, err)
	var kept string
	require.NoError(t, db.QueryRowContext(ctx, `SELECT metadata FROM analytics_events WHERE journey_slug = 'a'`).Scan(&kept))
	require.Equal(t, "kept", kept)
	var indexes int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = 'analytics_events' AND name LIKE 'idx_%'`).Scan(&indexes))
	require.Equal(t, 4, indexes)

	require.NoError(t, Migrate(db, schemaPath))
	var rows int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_events`).Scan(&rows))
	require.Equal(t, 2, rows)
}
