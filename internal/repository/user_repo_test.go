package repository

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupUserRepo(t *testing.T) (UserRepository, *sql.DB) {
	t.Helper()
	projectRoot, _ := filepath.Abs("../..")
	db, err := NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))
	return NewUserRepository(db), db
}

func TestUserRepo_CreateAndGetByEmail(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	user := &model.User{Username: "alice", Email: "alice@example.com", PasswordHash: "hash123", Role: model.RoleUser, Level: 1}
	require.NoError(t, repo.Create(ctx, user))
	assert.Greater(t, user.ID, int64(0))

	found, err := repo.GetByEmail(ctx, "alice@example.com")
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, "alice", found.Username)
	assert.Equal(t, model.RoleUser, found.Role)
}

func TestUserRepo_GetByEmail_NotFound(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	found, err := repo.GetByEmail(ctx, "nobody@example.com")
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestUserRepo_GetByID(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	user := &model.User{Username: "bob", Email: "bob@example.com", PasswordHash: "hash456", Role: model.RoleUser, Level: 1}
	require.NoError(t, repo.Create(ctx, user))

	found, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, "bob", found.Username)
}

func TestUserRepo_AddPoints(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	user := &model.User{Username: "charlie", Email: "charlie@example.com", PasswordHash: "hash", Points: 0, Role: model.RoleUser, Level: 1}
	require.NoError(t, repo.Create(ctx, user))

	err := repo.AddPoints(ctx, user.ID, 50, "test_action", "test description")
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, user.ID)
	assert.Equal(t, 50, found.Points)

	history, err := repo.ListPointsHistory(ctx, user.ID)
	require.NoError(t, err)
	assert.Len(t, history, 1)
	assert.Equal(t, 50, history[0].PointsDelta)
	assert.Equal(t, 50, history[0].BalanceAfter)
}

func TestUserRepo_SaveAndUnsaveJourney(t *testing.T) {
	repo, db := setupUserRepo(t)
	ctx := context.Background()

	user := &model.User{Username: "dave", Email: "dave@example.com", PasswordHash: "hash", Role: model.RoleUser, Level: 1}
	require.NoError(t, repo.Create(ctx, user))

	// Seed a journey first
	_, err := db.ExecContext(ctx, "INSERT INTO journeys (title, slug) VALUES (?, ?)", "Test Journey", "test-journey")
	require.NoError(t, err)
	var journeyID int64
	require.NoError(t, db.QueryRowContext(ctx, "SELECT id FROM journeys WHERE slug = ?", "test-journey").Scan(&journeyID))

	err = repo.SaveJourney(ctx, user.ID, journeyID)
	require.NoError(t, err)

	saved, err := repo.ListSavedJourneys(ctx, user.ID)
	require.NoError(t, err)
	assert.Len(t, saved, 1)
	assert.Equal(t, journeyID, saved[0])

	err = repo.UnsaveJourney(ctx, user.ID, journeyID)
	require.NoError(t, err)

	saved, _ = repo.ListSavedJourneys(ctx, user.ID)
	assert.Len(t, saved, 0)
}

func TestUserRepo_ListPointsHistory_Empty(t *testing.T) {
	repo, _ := setupUserRepo(t)
	ctx := context.Background()

	user := &model.User{Username: "eve", Email: "eve@example.com", PasswordHash: "hash", Role: model.RoleUser, Level: 1}
	require.NoError(t, repo.Create(ctx, user))

	history, err := repo.ListPointsHistory(ctx, user.ID)
	require.NoError(t, err)
	assert.Len(t, history, 0)
}
