package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/100-journeys/app/internal/model"
)

type sqliteJourneyRepo struct {
	db *sql.DB
}

func NewJourneyRepository(db *sql.DB) JourneyRepository {
	return &sqliteJourneyRepo{db: db}
}

func (r *sqliteJourneyRepo) List(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error) {
	where, args := r.buildWhere(filter)

	// Count total
	countQuery := "SELECT COUNT(DISTINCT j.id) FROM journeys j" + r.buildJoins(filter) + where
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count journeys: %w", err)
	}

	// Fetch journeys
	query := `
		SELECT DISTINCT j.id, j.title, j.slug, j.subtitle, j.story_hook, j.story, j.region,
			j.fantasy_type, j.visual_style, j.adventure_index, j.obscurity_level, j.risk_level,
			j.mood_keywords, j.image_path, j.booking_url, j.price, j.created_at, j.updated_at
		FROM journeys j` + r.buildJoins(filter) + where + `
		ORDER BY j.id
		LIMIT ? OFFSET ?`

	offset := (filter.Page - 1) * filter.Limit
	if filter.Page <= 0 {
		offset = 0
	}
	queryArgs := append(args, filter.Limit, offset)

	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list journeys: %w", err)
	}
	defer rows.Close()

	var journeys []model.Journey
	for rows.Next() {
		var j model.Journey
		var subtitle, story, storyHook, region, moodKeywords, imagePath, bookingURL sql.NullString
		var adventureIndex, obscurityLevel, riskLevel sql.NullInt64

		if err := rows.Scan(
			&j.ID, &j.Title, &j.Slug, &subtitle, &storyHook, &story, &region,
			&j.FantasyType, &j.VisualStyle, &adventureIndex, &obscurityLevel, &riskLevel,
			&moodKeywords, &imagePath, &bookingURL, &j.Price, &j.CreatedAt, &j.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan journey: %w", err)
		}
		j.Subtitle = subtitle.String
		j.Story = story.String
		j.StoryHook = storyHook.String
		j.Region = region.String
		if adventureIndex.Valid {
			j.AdventureIndex = int(adventureIndex.Int64)
		}
		if obscurityLevel.Valid {
			j.ObscurityLevel = int(obscurityLevel.Int64)
		}
		if riskLevel.Valid {
			j.RiskLevel = int(riskLevel.Int64)
		}
		if moodKeywords.Valid && moodKeywords.String != "" {
			_ = json.Unmarshal([]byte(moodKeywords.String), &j.MoodKeywords)
		}
		j.ImagePath = imagePath.String
		if bookingURL.Valid {
			j.BookingURL = &bookingURL.String
		}
		journeys = append(journeys, j)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("rows error: %w", err)
	}

	// Preload tags and MBTI for fetched journeys
	if len(journeys) > 0 {
		if err := r.preloadTags(ctx, journeys); err != nil {
			return nil, 0, err
		}
		if err := r.preloadMBTI(ctx, journeys); err != nil {
			return nil, 0, err
		}
	}

	return journeys, total, nil
}

func (r *sqliteJourneyRepo) GetBySlug(ctx context.Context, slug string) (*model.Journey, error) {
	query := `
		SELECT j.id, j.title, j.slug, j.subtitle, j.story_hook, j.story, j.region,
			j.fantasy_type, j.visual_style, j.adventure_index, j.obscurity_level, j.risk_level,
			j.mood_keywords, j.image_path, j.booking_url, j.price, j.created_at, j.updated_at
		FROM journeys j
		WHERE j.slug = ?`

	var j model.Journey
	var subtitle, story, storyHook, region, moodKeywords, imagePath, bookingURL sql.NullString
	var adventureIndex, obscurityLevel, riskLevel sql.NullInt64

	if err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&j.ID, &j.Title, &j.Slug, &subtitle, &storyHook, &story, &region,
		&j.FantasyType, &j.VisualStyle, &adventureIndex, &obscurityLevel, &riskLevel,
		&moodKeywords, &imagePath, &bookingURL, &j.Price, &j.CreatedAt, &j.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get journey by slug: %w", err)
	}

	j.Subtitle = subtitle.String
	j.Story = story.String
	j.StoryHook = storyHook.String
	j.Region = region.String
	if adventureIndex.Valid {
		j.AdventureIndex = int(adventureIndex.Int64)
	}
	if obscurityLevel.Valid {
		j.ObscurityLevel = int(obscurityLevel.Int64)
	}
	if riskLevel.Valid {
		j.RiskLevel = int(riskLevel.Int64)
	}
	if moodKeywords.Valid && moodKeywords.String != "" {
		_ = json.Unmarshal([]byte(moodKeywords.String), &j.MoodKeywords)
	}
	j.ImagePath = imagePath.String
	if bookingURL.Valid {
		j.BookingURL = &bookingURL.String
	}

	// Preload tags and MBTI
	journeys := []model.Journey{j}
	if err := r.preloadTags(ctx, journeys); err != nil {
		return nil, err
	}
	if err := r.preloadMBTI(ctx, journeys); err != nil {
		return nil, err
	}
	j.Tags = journeys[0].Tags
	j.MBTITypes = journeys[0].MBTITypes

	return &j, nil
}

func (r *sqliteJourneyRepo) ListTags(ctx context.Context) ([]model.Tag, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id, name, slug FROM tags ORDER BY id")
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	defer rows.Close()

	var tags []model.Tag
	for rows.Next() {
		var t model.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug); err != nil {
			return nil, fmt.Errorf("scan tag: %w", err)
		}
		tags = append(tags, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return tags, nil
}

func (r *sqliteJourneyRepo) ListMBTITypes(ctx context.Context) ([]model.MBTIType, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id, code, name, description, color FROM mbti_types ORDER BY id")
	if err != nil {
		return nil, fmt.Errorf("list mbti types: %w", err)
	}
	defer rows.Close()

	var types []model.MBTIType
	for rows.Next() {
		var m model.MBTIType
		var desc sql.NullString
		if err := rows.Scan(&m.ID, &m.Code, &m.Name, &desc, &m.Color); err != nil {
			return nil, fmt.Errorf("scan mbti type: %w", err)
		}
		m.Description = desc.String
		types = append(types, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}
	return types, nil
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

func (r *sqliteJourneyRepo) buildJoins(filter model.JourneyFilter) string {
	var joins []string
	if filter.TagSlug != "" {
		joins = append(joins, " INNER JOIN journey_tags jt ON jt.journey_id = j.id INNER JOIN tags t ON t.id = jt.tag_id")
	}
	if filter.MBTIType != "" {
		joins = append(joins, " INNER JOIN journey_mbti jm ON jm.journey_id = j.id INNER JOIN mbti_types m ON m.id = jm.mbti_id")
	}
	return strings.Join(joins, "")
}

func (r *sqliteJourneyRepo) buildWhere(filter model.JourneyFilter) (string, []interface{}) {
	var conds []string
	var args []interface{}

	if strings.TrimSpace(filter.Query) != "" {
		query := "%" + strings.ToLower(escapeLikeWildcards(strings.TrimSpace(filter.Query))) + "%"
		match := `(LOWER(j.title) LIKE ? ESCAPE '\' OR LOWER(j.subtitle) LIKE ? ESCAPE '\' OR LOWER(j.story_hook) LIKE ? ESCAPE '\' OR LOWER(j.story) LIKE ? ESCAPE '\' OR LOWER(j.region) LIKE ? ESCAPE '\' OR LOWER(j.mood_keywords) LIKE ? ESCAPE '\')`
		args = append(args, query, query, query, query, query, query)
		if filter.Locale != "" {
			// Also match the translation the user is reading, so English queries find English copy.
			match = `(` + match + ` OR EXISTS (SELECT 1 FROM journey_translations tr WHERE tr.journey_id = j.id AND tr.locale = ?
				AND (LOWER(tr.title) LIKE ? ESCAPE '\' OR LOWER(tr.subtitle) LIKE ? ESCAPE '\' OR LOWER(tr.story_hook) LIKE ? ESCAPE '\'
				  OR LOWER(tr.story) LIKE ? ESCAPE '\' OR LOWER(tr.region) LIKE ? ESCAPE '\' OR LOWER(tr.mood_keywords) LIKE ? ESCAPE '\')))`
			args = append(args, filter.Locale, query, query, query, query, query, query)
		}
		conds = append(conds, match)
	}
	if len(filter.IDs) > 0 {
		placeholders := make([]string, len(filter.IDs))
		for i, id := range filter.IDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		conds = append(conds, "j.id IN ("+strings.Join(placeholders, ",")+")")
	}
	if filter.TagSlug != "" {
		conds = append(conds, "t.slug = ?")
		args = append(args, filter.TagSlug)
	}
	if filter.VisualStyle != "" {
		conds = append(conds, "j.visual_style = ?")
		args = append(args, filter.VisualStyle)
	}
	if filter.FantasyType != "" {
		conds = append(conds, "j.fantasy_type = ?")
		args = append(args, filter.FantasyType)
	}
	if filter.AdventureMin > 0 {
		conds = append(conds, "j.adventure_index >= ?")
		args = append(args, filter.AdventureMin)
	}
	if filter.AdventureMax > 0 {
		conds = append(conds, "j.adventure_index <= ?")
		args = append(args, filter.AdventureMax)
	}
	if filter.ObscurityMin > 0 {
		conds = append(conds, "j.obscurity_level >= ?")
		args = append(args, filter.ObscurityMin)
	}
	if filter.MBTIType != "" {
		conds = append(conds, "m.code = ?")
		args = append(args, filter.MBTIType)
	}

	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

func escapeLikeWildcards(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}

func (r *sqliteJourneyRepo) preloadTags(ctx context.Context, journeys []model.Journey) error {
	if len(journeys) == 0 {
		return nil
	}
	ids := make([]interface{}, len(journeys))
	idMap := make(map[int64]int)
	for i, j := range journeys {
		ids[i] = j.ID
		idMap[j.ID] = i
	}

	placeholders := make([]string, len(ids))
	for i := range placeholders {
		placeholders[i] = "?"
	}

	query := fmt.Sprintf(`
		SELECT jt.journey_id, t.id, t.name, t.slug
		FROM journey_tags jt
		INNER JOIN tags t ON t.id = jt.tag_id
		WHERE jt.journey_id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := r.db.QueryContext(ctx, query, ids...)
	if err != nil {
		return fmt.Errorf("preload tags: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var journeyID int64
		var tag model.Tag
		if err := rows.Scan(&journeyID, &tag.ID, &tag.Name, &tag.Slug); err != nil {
			return fmt.Errorf("scan tag: %w", err)
		}
		if idx, ok := idMap[journeyID]; ok {
			journeys[idx].Tags = append(journeys[idx].Tags, tag)
		}
	}
	return rows.Err()
}

func (r *sqliteJourneyRepo) preloadMBTI(ctx context.Context, journeys []model.Journey) error {
	if len(journeys) == 0 {
		return nil
	}
	ids := make([]interface{}, len(journeys))
	idMap := make(map[int64]int)
	for i, j := range journeys {
		ids[i] = j.ID
		idMap[j.ID] = i
	}

	placeholders := make([]string, len(ids))
	for i := range placeholders {
		placeholders[i] = "?"
	}

	query := fmt.Sprintf(`
		SELECT jm.journey_id, m.id, m.code, m.name, m.description, m.color, jm.compatibility_score
		FROM journey_mbti jm
		INNER JOIN mbti_types m ON m.id = jm.mbti_id
		WHERE jm.journey_id IN (%s)
		ORDER BY jm.journey_id, jm.compatibility_score DESC, m.id
	`, strings.Join(placeholders, ","))

	rows, err := r.db.QueryContext(ctx, query, ids...)
	if err != nil {
		return fmt.Errorf("preload mbti: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var journeyID int64
		var jm model.JourneyMBTI
		var desc sql.NullString
		if err := rows.Scan(&journeyID, &jm.MBTIType.ID, &jm.MBTIType.Code, &jm.MBTIType.Name, &desc, &jm.MBTIType.Color, &jm.CompatibilityScore); err != nil {
			return fmt.Errorf("scan mbti: %w", err)
		}
		jm.MBTIType.Description = desc.String
		if idx, ok := idMap[journeyID]; ok {
			journeys[idx].MBTITypes = append(journeys[idx].MBTITypes, jm)
		}
	}
	return rows.Err()
}

// ApplyTranslations replaces base-language copy with the requested locale where a translation exists.
func (r *sqliteJourneyRepo) ApplyTranslations(ctx context.Context, journeys []model.Journey, locale string) error {
	if len(journeys) == 0 || locale == "" {
		return nil
	}
	args := []interface{}{locale}
	idMap := make(map[int64]int, len(journeys))
	placeholders := make([]string, len(journeys))
	for i, j := range journeys {
		placeholders[i] = "?"
		args = append(args, j.ID)
		idMap[j.ID] = i
	}
	rows, err := r.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT journey_id, title, subtitle, story_hook, story, region, mood_keywords
		FROM journey_translations
		WHERE locale = ? AND journey_id IN (%s)`, strings.Join(placeholders, ",")), args...)
	if err != nil {
		return fmt.Errorf("load translations: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var title string
		var subtitle, storyHook, story, region, moods sql.NullString
		if err := rows.Scan(&id, &title, &subtitle, &storyHook, &story, &region, &moods); err != nil {
			return fmt.Errorf("scan translation: %w", err)
		}
		idx, ok := idMap[id]
		if !ok {
			continue
		}
		j := &journeys[idx]
		j.Locale = locale
		if title != "" {
			j.Title = title
		}
		if subtitle.String != "" {
			j.Subtitle = subtitle.String
		}
		if storyHook.String != "" {
			j.StoryHook = storyHook.String
		}
		if story.String != "" {
			j.Story = story.String
		}
		if region.String != "" {
			j.Region = region.String
		}
		if moods.String != "" {
			var keywords []string
			if err := json.Unmarshal([]byte(moods.String), &keywords); err == nil && len(keywords) > 0 {
				j.MoodKeywords = keywords
			}
		}
	}
	return rows.Err()
}
