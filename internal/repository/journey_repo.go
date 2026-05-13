package repository

// JourneyRepository defines the data access interface.
// Implementation in journey_repo_sqlite.go — populated in SDD/TDD phase.

import (
	"context"
	"github.com/100-journeys/app/internal/model"
)

type JourneyRepository interface {
	List(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error)
	GetBySlug(ctx context.Context, slug string) (*model.Journey, error)
	ListTags(ctx context.Context) ([]model.Tag, error)
	ListMBTITypes(ctx context.Context) ([]model.MBTIType, error)
}
