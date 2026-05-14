package analytics

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/100-journeys/app/internal/repository"
	"github.com/stretchr/testify/require"
)

func TestBufferFlushPersistsEvents(t *testing.T) {
	projectRoot, err := filepath.Abs("../..")
	require.NoError(t, err)

	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	buffer := NewBuffer(db, BufferOptions{
		Capacity:  8,
		BatchSize: 4,
	})
	t.Cleanup(func() { closeBuffer(t, buffer) })

	require.True(t, buffer.Track(Event{Type: EventJourneyClick, JourneySlug: "bolivia-salt-flat-trek"}))
	require.True(t, buffer.Track(Event{Type: EventJourneyClick, JourneySlug: "bolivia-salt-flat-trek"}))
	require.True(t, buffer.Track(Event{Type: EventPetReply, MBTIType: "INFP"}))
	require.NoError(t, buffer.Flush(t.Context()))

	var total int
	require.NoError(t, db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM analytics_events`).Scan(&total))
	require.Equal(t, 3, total)

	var clicks int
	require.NoError(t, db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM analytics_events WHERE event_type = ?`, EventJourneyClick).Scan(&clicks))
	require.Equal(t, 2, clicks)
}

func TestBufferDefaultOptionsAcceptFiveFigureBurstWithoutDrop(t *testing.T) {
	projectRoot, err := filepath.Abs("../..")
	require.NoError(t, err)

	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	opts := DefaultOptions()
	opts.FlushInterval = 0
	buffer := NewBuffer(db, opts)
	t.Cleanup(func() { closeBuffer(t, buffer) })

	const burst = 20000
	for i := 0; i < burst; i++ {
		require.True(t, buffer.Track(Event{Type: EventJourneyClick, JourneySlug: "bolivia-salt-flat-trek"}), "event %d should be accepted", i)
	}

	stats := buffer.Stats()
	require.EqualValues(t, burst, stats.Accepted)
	require.Zero(t, stats.Dropped)
	require.Equal(t, burst, stats.Queued)
}

func closeBuffer(t *testing.T, buffer *Buffer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	require.NoError(t, buffer.Close(ctx))
}
