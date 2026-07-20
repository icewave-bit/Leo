package bot

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

type mockMessenger struct {
	mu      sync.Mutex
	sent    []tgbotapi.Chattable
	updates chan tgbotapi.Update
	sendErr error
}

func (m *mockMessenger) Send(c tgbotapi.Chattable) (tgbotapi.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, c)
	if m.sendErr != nil {
		return tgbotapi.Message{}, m.sendErr
	}
	return tgbotapi.Message{MessageID: 1}, nil
}

func (m *mockMessenger) GetUpdatesChan(_ tgbotapi.UpdateConfig) tgbotapi.UpdatesChannel {
	return m.updates
}

func (m *mockMessenger) messages() []tgbotapi.Chattable {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]tgbotapi.Chattable, len(m.sent))
	copy(out, m.sent)
	return out
}

type mockMonitor struct {
	linkIn         tutorapi.LinkInput
	today          tutorapi.Schedule
	notLink        bool
	linkErr        error
	telegramNotify *tutorapi.TelegramNotify
}

func defaultTelegramNotify() tutorapi.TelegramNotify {
	return tutorapi.TelegramNotify{
		Enabled:     true,
		LeadMinutes: 30,
		Silent:      false,
		Lessons:     true,
		Personal:    false,
	}
}

func (m *mockMonitor) tutorNotify() tutorapi.TelegramNotify {
	if m.telegramNotify != nil {
		return *m.telegramNotify
	}
	return defaultTelegramNotify()
}

func (m *mockMonitor) Link(_ context.Context, in tutorapi.LinkInput) (tutorapi.Tutor, error) {
	m.linkIn = in
	if m.linkErr != nil {
		return tutorapi.Tutor{}, m.linkErr
	}
	return tutorapi.Tutor{Name: "Anna", Timezone: "Europe/Minsk"}, nil
}

func (m *mockMonitor) Me(_ context.Context, _ int64) (tutorapi.Tutor, error) {
	if m.notLink {
		return tutorapi.Tutor{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.Tutor{
		Name:           "Anna",
		Timezone:       "Europe/Minsk",
		TelegramNotify: m.tutorNotify(),
	}, nil
}

func (m *mockMonitor) Today(_ context.Context, _ int64) (tutorapi.Schedule, error) {
	if m.notLink {
		return tutorapi.Schedule{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return m.today, nil
}

func (m *mockMonitor) Week(_ context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.Today(context.Background(), telegramUserID)
}

func (m *mockMonitor) Students(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func (m *mockMonitor) Debt(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func newTestBot(api Messenger, monitor Monitor) *Bot {
	return New(Config{
		API:          api,
		Monitor:      monitor,
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval: 0,
	})
}

func TestHandleUpdate_help(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "/help",
			Chat: &tgbotapi.Chat{ID: 7},
			From: &tgbotapi.User{ID: 1},
		},
	}))
	require.Len(t, msg.messages(), 1)
	out := msg.messages()[0].(tgbotapi.MessageConfig)
	assert.Contains(t, out.Text, "/today")
}

func TestHandleUpdate_link(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	mon := &mockMonitor{}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "/link ab12",
			Chat: &tgbotapi.Chat{ID: 7},
			From: &tgbotapi.User{ID: 99, UserName: "fedor"},
		},
	}))

	assert.Equal(t, "ab12", mon.linkIn.Code)
	assert.Equal(t, int64(99), mon.linkIn.TelegramUserID)
	assert.Equal(t, "fedor", mon.linkIn.TelegramUsername)

	out := msg.messages()[0].(tgbotapi.MessageConfig)
	assert.Contains(t, out.Text, "Anna")
}

func TestHandleUpdate_notLinked(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{notLink: true})

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "/today",
			Chat: &tgbotapi.Chat{ID: 7},
			From: &tgbotapi.User{ID: 1},
		},
	}))

	out := msg.messages()[0].(tgbotapi.MessageConfig)
	assert.Contains(t, out.Text, "/link")
}

func TestHandleUpdate_today(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T10:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "/today@For_Leo_Bot",
			Chat: &tgbotapi.Chat{ID: 7},
			From: &tgbotapi.User{ID: 1},
		},
	}))

	out := msg.messages()[0].(tgbotapi.MessageConfig)
	assert.Contains(t, out.Text, "Leo")
	assert.Contains(t, out.Text, "запланирован")
}

func TestHandleUpdate_remembersChat(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "/help",
			Chat: &tgbotapi.Chat{ID: 42},
			From: &tgbotapi.User{ID: 7},
		},
	}))

	chats := b.chats.snapshot()
	assert.Equal(t, int64(42), chats[7])
}

func TestHandleUpdate_ignoresNonCommand(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), tgbotapi.Update{
		Message: &tgbotapi.Message{
			Text: "hello",
			Chat: &tgbotapi.Chat{ID: 7},
			From: &tgbotapi.User{ID: 1},
		},
	}))
	assert.Empty(t, msg.messages())
	assert.Equal(t, int64(7), b.chats.snapshot()[1])
}

func TestRun_stopsOnContextCancel(t *testing.T) {
	msg := &mockMessenger{updates: make(chan tgbotapi.Update)}
	b := newTestBot(msg, &mockMonitor{})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- b.Run(ctx)
	}()

	time.Sleep(10 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		assert.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("run did not stop after context cancel")
	}
}

func TestParseCommand(t *testing.T) {
	cmd, arg := parseCommand("/link@Bot AB12")
	assert.Equal(t, "/link", cmd)
	assert.Equal(t, "AB12", arg)
}
