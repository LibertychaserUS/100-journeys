package ai

import (
	"context"
	"strings"

	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
)

type RecommendEngine struct {
	repo repository.JourneyRepository
}

func NewRecommendEngine(repo repository.JourneyRepository) *RecommendEngine {
	return &RecommendEngine{repo: repo}
}

func (e *RecommendEngine) Recommend(ctx context.Context, mbtiType string, keywords []string) ([]model.Journey, error) {
	// Query all journeys with high MBTI compatibility
	filter := model.JourneyFilter{
		MBTIType: mbtiType,
		Limit:    100,
		Page:     1,
	}

	journeys, _, err := e.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	// Score and rank journeys
	type scoredJourney struct {
		journey model.Journey
		score   int
	}
	var scored []scoredJourney

	for _, j := range journeys {
		score := 0

		// MBTI compatibility score (>=4 already filtered by repo when mbtiType set)
		for _, jm := range j.MBTITypes {
			if strings.EqualFold(jm.MBTIType.Code, mbtiType) {
				score += jm.CompatibilityScore * 10
			}
		}

		// Keyword matching in mood_keywords
		for _, kw := range keywords {
			kwLower := strings.ToLower(kw)
			for _, mk := range j.MoodKeywords {
				if strings.Contains(strings.ToLower(mk), kwLower) {
					score += 5
				}
			}
			// Tag matching
			for _, tag := range j.Tags {
				if strings.Contains(strings.ToLower(tag.Name), kwLower) || strings.Contains(strings.ToLower(tag.Slug), kwLower) {
					score += 3
				}
			}
			// Title/subtitle/story matching
			if strings.Contains(strings.ToLower(j.Title), kwLower) {
				score += 2
			}
			if strings.Contains(strings.ToLower(j.Subtitle), kwLower) {
				score += 2
			}
			if strings.Contains(strings.ToLower(j.Story), kwLower) {
				score += 1
			}
		}

		if score > 0 {
			scored = append(scored, scoredJourney{journey: j, score: score})
		}
	}

	// If no MBTI match but keywords provided, try keyword-only search across all journeys
	if len(scored) == 0 && len(keywords) > 0 {
		allJourneys, _, err := e.repo.List(ctx, model.JourneyFilter{Limit: 100, Page: 1})
		if err != nil {
			return nil, err
		}
		for _, j := range allJourneys {
			score := 0
			for _, kw := range keywords {
				kwLower := strings.ToLower(kw)
				for _, mk := range j.MoodKeywords {
					if strings.Contains(strings.ToLower(mk), kwLower) {
						score += 5
					}
				}
				for _, tag := range j.Tags {
					if strings.Contains(strings.ToLower(tag.Name), kwLower) || strings.Contains(strings.ToLower(tag.Slug), kwLower) {
						score += 3
					}
				}
				if strings.Contains(strings.ToLower(j.Title), kwLower) {
					score += 2
				}
				if strings.Contains(strings.ToLower(j.Subtitle), kwLower) {
					score += 2
				}
				if strings.Contains(strings.ToLower(j.Story), kwLower) {
					score += 1
				}
			}
			if score > 0 {
				scored = append(scored, scoredJourney{journey: j, score: score})
			}
		}
	}

	// Sort by score descending and take top 3
	// Simple bubble sort since list is small
	for i := 0; i < len(scored); i++ {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].score > scored[i].score {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}

	var result []model.Journey
	limit := 3
	if len(scored) < limit {
		limit = len(scored)
	}
	for i := 0; i < limit; i++ {
		result = append(result, scored[i].journey)
	}

	return result, nil
}
