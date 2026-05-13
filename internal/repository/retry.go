package repository

import (
	"context"
	"strings"
	"time"
)

func retryBusy(ctx context.Context, op func() error) error {
	var err error
	for attempt := 0; attempt < 8; attempt++ {
		err = op()
		if err == nil || !isBusyErr(err) {
			return err
		}
		delay := time.Duration(12*(attempt+1)) * time.Millisecond
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return err
}

func isBusyErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "database is locked") ||
		strings.Contains(msg, "sqlite_busy") ||
		strings.Contains(msg, "busy")
}
