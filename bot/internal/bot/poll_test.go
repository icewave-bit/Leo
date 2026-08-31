package bot

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func plannedLesson(start time.Time) tutorapi.Lesson {
	return tutorapi.Lesson{
		ID:          "lesson-1",
		StartUTC:    start.Format(time.RFC3339),
		Status:      "planned",
		StudentName: "Leo",
		DurationMin: 60,
	}
}

func dueLesson(start time.Time) tutorapi.DueReminder {
	lesson := plannedLesson(start)
	return tutorapi.DueReminder{
		Kind:           "lesson",
		TelegramUserID: 42,
		Role:           "tutor",
		Timezone:       "UTC",
		LeadMinutes:    30,
		Silent:         true,
		Lesson:         &lesson,
	}
}

func TestPollOnce_sendsReminderOnce(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	meet := "https://meet.google.com/abc-defg-hij"
	reminder := dueLesson(start)
	reminder.Lesson.MeetURL = &meet
	msg := &mockMessenger{}
	mon := &mockMonitor{due: []tutorapi.DueReminder{reminder}}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor:        mon,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   time.Minute,
	})
	require.NoError(t, err)

	require.NoError(t, b.pollOnce(context.Background()))
	require.Len(t, msg.messages(), 1)

	out := msg.messages()[0]
	assert.Equal(t, int64(42), out.ChatID)
	assert.True(t, out.DisableNotification)
	assert.Contains(t, out.Text, "Leo")
	assert.NotContains(t, out.Text, meet)
	kb, ok := out.ReplyMarkup.(*models.InlineKeyboardMarkup)
	require.True(t, ok)
	require.Len(t, kb.InlineKeyboard, 1)
	require.Len(t, kb.InlineKeyboard[0], 1)
	assert.Equal(t, "Подключиться", kb.InlineKeyboard[0][0].Text)
	assert.Equal(t, meet, kb.InlineKeyboard[0][0].URL)
	require.Len(t, mon.markedSent, 1)
	assert.Equal(t, "lesson-1", mon.markedSent[0].EntityID)
	assert.Equal(t, int64(42), mon.markedSent[0].TelegramUserID)

	require.NoError(t, b.pollOnce(context.Background()))
	assert.Len(t, msg.messages(), 1)
	assert.Len(t, mon.markedSent, 1)
	assert.False(t, mon.todayCalled)
}

func TestPollOnce_emptyDueDoesNotSend(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor:        mon,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   time.Minute,
	})
	require.NoError(t, err)

	require.NoError(t, b.pollOnce(context.Background()))
	assert.Empty(t, msg.messages())
	assert.Empty(t, mon.markedSent)
	assert.False(t, mon.todayCalled)
}

func TestPollOnce_sendsPersonalReminder(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			due: []tutorapi.DueReminder{{
				Kind:           "personal",
				TelegramUserID: 7,
				Role:           "tutor",
				Timezone:       "UTC",
				LeadMinutes:    30,
				Event: &tutorapi.PersonalEvent{
					ID:          "pe-1",
					Title:       "Yoga",
					StartUTC:    start.Format(time.RFC3339),
					DurationMin: 45,
					GroupName:   "Здоровье",
				},
			}},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)

	require.NoError(t, b.pollOnce(context.Background()))
	require.Len(t, msg.messages(), 1)
	assert.Equal(t, int64(7), msg.messages()[0].ChatID)
	assert.Contains(t, msg.messages()[0].Text, "Yoga")
	assert.NotContains(t, msg.messages()[0].Text, "урок")
}

func TestPollOnce_usesLeadMinutesFromPayload(t *testing.T) {
	start := time.Now().UTC().Add(12 * time.Minute).Truncate(time.Second)
	reminder := dueLesson(start)
	reminder.LeadMinutes = 15
	reminder.Silent = false
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor:        &mockMonitor{due: []tutorapi.DueReminder{reminder}},
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   time.Minute,
	})
	require.NoError(t, err)

	require.NoError(t, b.pollOnce(context.Background()))
	require.Len(t, msg.messages(), 1)
	assert.Contains(t, msg.messages()[0].Text, "15 мин")
}

func TestPollOnce_studentReminder(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	meet := "https://meet.google.com/stu-dent-link"
	lesson := plannedLesson(start)
	lesson.MeetURL = &meet
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			due: []tutorapi.DueReminder{{
				Kind:           "lesson",
				TelegramUserID: 99,
				Role:           "student",
				Timezone:       "UTC",
				LeadMinutes:    30,
				Lesson:         &lesson,
			}},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)

	require.NoError(t, b.pollOnce(context.Background()))
	require.Len(t, msg.messages(), 1)
	out := msg.messages()[0]
	assert.Equal(t, int64(99), out.ChatID)
	assert.Contains(t, out.Text, "Напоминание")
	assert.NotContains(t, out.Text, "с Leo")
	assert.NotContains(t, out.Text, meet)
	kb, ok := out.ReplyMarkup.(*models.InlineKeyboardMarkup)
	require.True(t, ok)
	require.Len(t, kb.InlineKeyboard, 1)
	assert.Equal(t, "Подключиться", kb.InlineKeyboard[0][0].Text)
	assert.Equal(t, meet, kb.InlineKeyboard[0][0].URL)
}

func TestPollOnce_sendFailureDoesNotMarkSent(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{sendErr: errors.New("telegram down")}
	mon := &mockMonitor{due: []tutorapi.DueReminder{dueLesson(start)}}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor:        mon,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   time.Minute,
	})
	require.NoError(t, err)

	require.Error(t, b.pollOnce(context.Background()))
	assert.Empty(t, mon.markedSent)
}

func TestRunPoll_disabledWaitsForCancel(t *testing.T) {
	b := newTestBot(&mockMessenger{}, &mockMonitor{})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- b.runPoll(ctx) }()
	time.Sleep(10 * time.Millisecond)
	cancel()
	assert.ErrorIs(t, <-done, context.Canceled)
}
