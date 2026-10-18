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

// JourneyTranslator overlays localized copy onto journeys loaded in the base language.
// It is a separate interface so read-only fakes of JourneyRepository stay small.
type JourneyTranslator interface {
	ApplyTranslations(ctx context.Context, journeys []model.Journey, locale string) error
}

// JourneyContentLoader attaches authored entrance metadata and localized content.
// full=false keeps only the summary (opens, role) for list views.
type JourneyContentLoader interface {
	LoadContent(ctx context.Context, journeys []model.Journey, locale string, full bool) error
}
