package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

const (
	EventJourneyView  = "journey_view"
	EventJourneyClick = "journey_click"
	EventPetReply     = "pet_reply"
	EventSearch       = "search"
	EventFilter       = "filter"
)

type Event struct {
	Type        string
	JourneySlug string
	UserID      int64
	MBTIType    string
	Gender      string
	Metadata    string
	CreatedAt   time.Time
}

type BufferOptions struct {
	Capacity      int
	BatchSize     int
	FlushInterval time.Duration
}

type BufferStats struct {
	Accepted int64 `json:"accepted"`
	Dropped  int64 `json:"dropped"`
	Queued   int   `json:"queued"`
}

type Buffer struct {
	db      *sql.DB
	events  chan Event
	done    chan struct{}
	once    sync.Once
	flushMu sync.Mutex
	wg      sync.WaitGroup

	batchSize int
	accepted  atomic.Int64
	dropped   atomic.Int64
}

func DefaultOptions() BufferOptions {
	return BufferOptions{
		Capacity:      32768,
		BatchSize:     512,
		FlushInterval: time.Second,
	}
}

func NewBuffer(db *sql.DB, opts BufferOptions) *Buffer {
	defaults := DefaultOptions()
	if opts.Capacity <= 0 {
		opts.Capacity = defaults.Capacity
	}
	if opts.BatchSize <= 0 {
		opts.BatchSize = defaults.BatchSize
	}

	b := &Buffer{
		db:        db,
		events:    make(chan Event, opts.Capacity),
		done:      make(chan struct{}),
		batchSize: opts.BatchSize,
	}
	if opts.FlushInterval > 0 {
		b.wg.Add(1)
		go b.run(opts.FlushInterval)
	}
	return b
}

func (b *Buffer) Track(event Event) bool {
	if !isAllowedEvent(event.Type) {
		b.dropped.Add(1)
		return false
	}
	if event.Gender == "" {
		event.Gender = "unknown"
	}
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}
	select {
	case b.events <- event:
		b.accepted.Add(1)
		return true
	default:
		b.dropped.Add(1)
		return false
	}
}

func (b *Buffer) Flush(ctx context.Context) error {
	b.flushMu.Lock()
	defer b.flushMu.Unlock()

	var batch []Event
	for {
		select {
		case event := <-b.events:
			batch = append(batch, event)
			if len(batch) >= b.batchSize {
				if err := b.persist(ctx, batch); err != nil {
					return err
				}
				batch = batch[:0]
			}
		default:
			if len(batch) > 0 {
				return b.persist(ctx, batch)
			}
			return nil
		}
	}
}

func (b *Buffer) Close(ctx context.Context) error {
	b.once.Do(func() {
		close(b.done)
	})
	b.wg.Wait()
	return b.Flush(ctx)
}

func (b *Buffer) Stats() BufferStats {
	return BufferStats{
		Accepted: b.accepted.Load(),
		Dropped:  b.dropped.Load(),
		Queued:   len(b.events),
	}
}

func (b *Buffer) run(interval time.Duration) {
	defer b.wg.Done()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			_ = b.Flush(context.Background())
		case <-b.done:
			return
		}
	}
}

func (b *Buffer) persist(ctx context.Context, events []Event) error {
	tx, err := b.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO analytics_events (event_type, journey_slug, user_id, mbti_type, gender, metadata, created_at)
		 VALUES (?, ?, NULLIF(?, 0), ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, event := range events {
		if !isAllowedEvent(event.Type) {
			continue
		}
		if event.Gender == "" {
			event.Gender = "unknown"
		}
		if event.CreatedAt.IsZero() {
			event.CreatedAt = time.Now().UTC()
		}
		if _, err := stmt.ExecContext(ctx, event.Type, event.JourneySlug, event.UserID, event.MBTIType, event.Gender, event.Metadata, event.CreatedAt); err != nil {
			return fmt.Errorf("insert analytics event: %w", err)
		}
	}
	return tx.Commit()
}

func isAllowedEvent(eventType string) bool {
	switch eventType {
	case EventJourneyView, EventJourneyClick, EventPetReply, EventSearch, EventFilter:
		return true
	default:
		return false
	}
}
