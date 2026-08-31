package tutorapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClient_DueReminders_noTelegramUserHeader(t *testing.T) {
	var gotAuth, gotTelegramID string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotTelegramID = r.Header.Get("X-Telegram-User-Id")
		assert.Equal(t, "/api/bot/reminders/due", r.URL.Path)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"reminders": []any{
				map[string]any{
					"kind":           "lesson",
					"telegramUserId": 42,
					"role":           "tutor",
					"timezone":       "UTC",
					"leadMinutes":    30,
					"silent":         false,
					"lesson": map[string]any{
						"id":          "lesson-1",
						"startUtc":    "2026-08-15T18:00:00.000Z",
						"status":      "planned",
						"studentName": "Leo",
					},
				},
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "test-bot-token-16",
	})

	reminders, err := c.DueReminders(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "Bearer test-bot-token-16", gotAuth)
	assert.Empty(t, gotTelegramID)
	require.Len(t, reminders, 1)
	assert.Equal(t, int64(42), reminders[0].TelegramUserID)
	require.NotNil(t, reminders[0].Lesson)
	assert.Equal(t, "Leo", reminders[0].Lesson.StudentName)
}

func TestClient_MarkRemindersSent_postsBody(t *testing.T) {
	var gotPath string
	var body map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		assert.Equal(t, http.MethodPost, r.Method)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "test-bot-token-16",
	})

	err := c.MarkRemindersSent(context.Background(), []tutorapi.SentReminder{{
		TelegramUserID: 42,
		Kind:           "lesson",
		EntityID:       "11111111-1111-4111-8111-111111111111",
	}})
	require.NoError(t, err)
	assert.Equal(t, "/api/bot/reminders/sent", gotPath)
	reminders, ok := body["reminders"].([]any)
	require.True(t, ok)
	require.Len(t, reminders, 1)
}

func TestClient_Today_sendsAuthHeaders(t *testing.T) {
	var gotAuth, gotTelegramID string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotTelegramID = r.Header.Get("X-Telegram-User-Id")
		assert.Equal(t, "/api/bot/today", r.URL.Path)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"timezone": "Europe/Minsk",
			"from":     "2026-07-20T21:00:00.000Z",
			"to":       "2026-07-21T21:00:00.000Z",
			"lessons":  []any{},
		})
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "test-bot-token-16",
	})

	schedule, err := c.Today(context.Background(), 42)
	require.NoError(t, err)
	assert.Equal(t, "Bearer test-bot-token-16", gotAuth)
	assert.Equal(t, "42", gotTelegramID)
	assert.Equal(t, "Europe/Minsk", schedule.Timezone)
}

func TestClient_Link_postsBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/bot/link", r.URL.Path)
		assert.Equal(t, "Bearer secret-token-here", r.Header.Get("Authorization"))
		assert.Empty(t, r.Header.Get("X-Telegram-User-Id"))

		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, "AB12", body["code"])
		assert.Equal(t, "99", body["telegramUserId"])
		assert.Equal(t, "fedor", body["telegramUsername"])

		_ = json.NewEncoder(w).Encode(map[string]any{
			"tutor": map[string]any{"id": "t1", "name": "Anna", "timezone": "UTC", "telegramLinked": true},
		})
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "secret-token-here",
	})

	tutor, err := c.Link(context.Background(), tutorapi.LinkInput{
		Code:             "AB12",
		TelegramUserID:   99,
		TelegramUsername: "fedor",
	})
	require.NoError(t, err)
	assert.Equal(t, "Anna", tutor.Name)
}

func TestClient_Me_decodesTelegramNotify(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/bot/me", r.URL.Path)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tutor": map[string]any{
				"name":           "Anna",
				"timezone":       "Europe/Minsk",
				"telegramLinked": true,
				"telegramNotify": map[string]any{
					"enabled":     true,
					"leadMinutes": 15,
					"silent":      true,
					"lessons":           true,
					"personal":          false,
					"personalGroupIds":  []string{},
				},
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "test-bot-token-16",
	})

	tutor, err := c.Me(context.Background(), 42)
	require.NoError(t, err)
	assert.Equal(t, "Anna", tutor.Name)
	assert.True(t, tutor.TelegramNotify.Enabled)
	assert.Equal(t, 15, tutor.TelegramNotify.LeadMinutes)
	assert.True(t, tutor.TelegramNotify.Silent)
	assert.True(t, tutor.TelegramNotify.Lessons)
	assert.False(t, tutor.TelegramNotify.Personal)
	assert.Empty(t, tutor.TelegramNotify.PersonalGroupIds)
}

func TestClient_NotLinked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{
				"code":    "TELEGRAM_NOT_LINKED",
				"message": "Telegram account is not linked",
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  srv.URL,
		BotToken: "test-bot-token-16",
	})

	_, err := c.Me(context.Background(), 1)
	require.Error(t, err)

	var apiErr *tutorapi.Error
	require.ErrorAs(t, err, &apiErr)
	assert.True(t, apiErr.NotLinked())
}
