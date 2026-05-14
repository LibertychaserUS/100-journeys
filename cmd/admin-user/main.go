package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	var (
		dbPath   = flag.String("db", "./data/app.db", "SQLite database path")
		schema   = flag.String("schema", "./db/schema.sql", "schema.sql path")
		email    = flag.String("email", "", "admin email")
		username = flag.String("username", "admin", "admin display name")
		password = flag.String("password", "", "admin password; prefer ADMIN_PASSWORD env")
		gender   = flag.String("gender", "prefer_not_to_say", "female|male|non_binary|prefer_not_to_say")
	)
	flag.Parse()

	if *password == "" {
		*password = os.Getenv("ADMIN_PASSWORD")
	}
	if err := validateInput(*email, *username, *password); err != nil {
		log.Fatal(err)
	}

	db, err := repository.NewDB(*dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := repository.Migrate(db, *schema); err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	repo := repository.NewUserRepository(db)
	existing, err := repo.GetByEmail(ctx, *email)
	if err != nil {
		log.Fatal(err)
	}
	if existing != nil {
		if err := promoteExistingAdmin(ctx, db, existing.ID); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("promoted existing user %s to admin (id=%d)\n", *email, existing.ID)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}
	user := &model.User{
		Username:     strings.TrimSpace(*username),
		Email:        strings.TrimSpace(*email),
		PasswordHash: string(hash),
		Role:         model.RoleAdmin,
		Level:        1,
		Gender:       *gender,
	}
	if err := repo.Create(ctx, user); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("created admin user %s (id=%d)\n", user.Email, user.ID)
}

func validateInput(email, username, password string) error {
	if strings.TrimSpace(email) == "" {
		return fmt.Errorf("-email is required")
	}
	if strings.TrimSpace(username) == "" {
		return fmt.Errorf("-username is required")
	}
	if len(password) < 12 {
		return fmt.Errorf("admin password must be at least 12 characters")
	}
	return nil
}

func promoteExistingAdmin(ctx context.Context, db *sql.DB, userID int64) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, userID)
	return err
}
