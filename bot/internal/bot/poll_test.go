package bot

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

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

func TestPollOnce_sendsReminderOnce(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	mon := &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons:  []tutorapi.Lesson{plannedLesson(start)},
		},
		telegramNotify: &tutorapi.TelegramNotify{
			Enabled:     true,
			LeadMinutes: 30,
			Silent:      true,
			Lessons:     true,
		},
	}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor:        mon,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	now := time.Now().UTC()
	require.NoError(t, b.pollOnce(context.Background(), now))
	require.Len(t, msg.messages(), 1)

	out := msg.messages()[0]
	assert.Equal(t, int64(99), out.ChatID)
	assert.True(t, out.DisableNotification)
	assert.Contains(t, out.Text, "Leo")

	require.NoError(t, b.pollOnce(context.Background(), now))
	assert.Len(t, msg.messages(), 1)
}

func TestPollOnce_skipsOutsideWindow(t *testing.T) {
	start := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	assert.Empty(t, msg.messages())
}

func TestPollOnce_skipsWhenNotificationsDisabled(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
			telegramNotify: &tutorapi.TelegramNotify{
				Enabled:     false,
				LeadMinutes: 30,
				Lessons:     true,
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	assert.Empty(t, msg.messages())
}

func TestPollOnce_skipsWhenLessonsDisabled(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
			telegramNotify: &tutorapi.TelegramNotify{
				Enabled:     true,
				LeadMinutes: 30,
				Lessons:     false,
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	assert.Empty(t, msg.messages())
}

func TestPollOnce_usesLeadMinutesFromPrefs(t *testing.T) {
	start := time.Now().UTC().Add(12 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
			telegramNotify: &tutorapi.TelegramNotify{
				Enabled:     true,
				LeadMinutes: 15,
				Lessons:     true,
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	require.Len(t, msg.messages(), 1)
	assert.Contains(t, msg.messages()[0].Text, "15 мин")
}

func TestPollOnce_skipsOutsideCustomLeadWindow(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
			telegramNotify: &tutorapi.TelegramNotify{
				Enabled:     true,
				LeadMinutes: 15,
				Lessons:     true,
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	assert.Empty(t, msg.messages())
}

func TestPollOnce_skipsNotLinked(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			notLink: true,
			today: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	assert.Empty(t, msg.messages())
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

func TestPollOnce_studentReminder(t *testing.T) {
	start := time.Now().UTC().Add(25 * time.Minute).Truncate(time.Second)
	msg := &mockMessenger{}
	b, err := New(Config{
		TelegramClient: msg,
		Monitor: &mockMonitor{
			notLink: true,
			student: &tutorapi.BotStudent{Name: "Leo", TutorName: "Anna", Timezone: "UTC"},
			studentToday: tutorapi.Schedule{
				Timezone: "UTC",
				Lessons:  []tutorapi.Lesson{plannedLesson(start)},
			},
		},
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: time.Minute,
	})
	require.NoError(t, err)
	b.chats.remember(1, 99)
	b.chats.setRole(1, roleStudent)

	require.NoError(t, b.pollOnce(context.Background(), time.Now().UTC()))
	require.Len(t, msg.messages(), 1)
	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Напоминание")
	assert.NotContains(t, out.Text, "с Leo")
}
