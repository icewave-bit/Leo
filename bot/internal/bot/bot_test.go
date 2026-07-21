package bot

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

type mockMessenger struct {
	mu      sync.Mutex
	sent    []*telegram.SendMessageParams
	sendErr error
}

func (m *mockMessenger) SendMessage(_ context.Context, params *telegram.SendMessageParams) (*models.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, params)
	if m.sendErr != nil {
		return nil, m.sendErr
	}
	return &models.Message{ID: 1}, nil
}

func (m *mockMessenger) Start(ctx context.Context) {
	<-ctx.Done()
}

func (m *mockMessenger) messages() []*telegram.SendMessageParams {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*telegram.SendMessageParams, len(m.sent))
	copy(out, m.sent)
	return out
}

type mockMonitor struct {
	linkIn         tutorapi.LinkInput
	today          tutorapi.Schedule
	studentToday   tutorapi.Schedule
	notLink        bool
	linkErr        error
	registerErr    error
	student        *tutorapi.BotStudent
	studentBalance *tutorapi.StudentBalance
	openSlots      *tutorapi.OpenSlots
	telegramNotify *tutorapi.TelegramNotify
	registerIn     tutorapi.StudentRegisterInput
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

func (m *mockMonitor) Tomorrow(_ context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.Today(context.Background(), telegramUserID)
}

func (m *mockMonitor) Week(_ context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.Today(context.Background(), telegramUserID)
}

func (m *mockMonitor) OpenSlots(_ context.Context, _ int64) (tutorapi.OpenSlots, error) {
	if m.openSlots != nil {
		return *m.openSlots, nil
	}
	if m.notLink {
		return tutorapi.OpenSlots{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.OpenSlots{Timezone: "UTC", Days: nil}, nil
}

func (m *mockMonitor) Students(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func (m *mockMonitor) Debt(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func (m *mockMonitor) RegisterStudent(_ context.Context, in tutorapi.StudentRegisterInput) (tutorapi.BotStudent, error) {
	m.registerIn = in
	if m.registerErr != nil {
		return tutorapi.BotStudent{}, m.registerErr
	}
	if m.student != nil {
		return *m.student, nil
	}
	return tutorapi.BotStudent{
		Name:      "Leo",
		TutorName: "Anna",
		Timezone:  "Europe/Minsk",
		Balance: tutorapi.StudentBalance{
			Prepaid: 10,
			Debt:    0,
			Currency: "EUR",
			BalanceKind: "money",
		},
	}, nil
}

func (m *mockMonitor) StudentMe(_ context.Context, _ int64) (tutorapi.BotStudent, error) {
	if m.student != nil {
		return *m.student, nil
	}
	if m.notLink {
		return tutorapi.BotStudent{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.BotStudent{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentWeek(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.StudentToday(ctx, telegramUserID)
}

func (m *mockMonitor) StudentToday(_ context.Context, _ int64) (tutorapi.Schedule, error) {
	if m.student != nil || m.studentToday.Timezone != "" || len(m.studentToday.Lessons) > 0 {
		if m.studentToday.Timezone == "" {
			out := m.studentToday
			out.Timezone = "UTC"
			return out, nil
		}
		return m.studentToday, nil
	}
	return tutorapi.Schedule{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentBalance(_ context.Context, _ int64) (tutorapi.StudentBalance, error) {
	if m.studentBalance != nil {
		return *m.studentBalance, nil
	}
	if m.student != nil {
		return m.student.Balance, nil
	}
	return tutorapi.StudentBalance{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentOpenSlots(_ context.Context, _ int64) (tutorapi.OpenSlots, error) {
	if m.openSlots != nil {
		return *m.openSlots, nil
	}
	return tutorapi.OpenSlots{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func newTestBot(api TelegramClient, monitor Monitor) *Bot {
	b, err := New(Config{
		TelegramClient: api,
		Monitor:        monitor,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   0,
	})
	if err != nil {
		panic(err)
	}
	return b
}

func TestHandleUpdate_help(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/help",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))
	require.Len(t, msg.messages(), 1)
	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Сегодня")
	assert.Contains(t, out.Text, "Слоты")
}

func TestHandleUpdate_link(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/link ab12",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	assert.Equal(t, "ab12", mon.linkIn.Code)
	assert.Equal(t, int64(99), mon.linkIn.TelegramUserID)
	assert.Equal(t, "fedor", mon.linkIn.TelegramUsername)

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Anna")
}

func TestHandleUpdate_notLinked(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{notLink: true})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Привязать")
}

func TestHandleUpdate_today(t *testing.T) {
	msg := &mockMessenger{}
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

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today@For_Leo_Bot",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "На сегодня")
	assert.Contains(t, out.Text, "Leo")
	assert.Contains(t, out.Text, "запланирован")
	require.IsType(t, &models.ReplyKeyboardMarkup{}, out.ReplyMarkup)
}

func TestHandleUpdate_todayIncludesPersonalEvents(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T12:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
			Events: []tutorapi.PersonalEvent{{
				StartUTC:    "2026-07-20T09:00:00Z",
				Title:       "Yoga",
				GroupName:   "Здоровье",
				DurationMin: 45,
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Yoga")
	assert.Contains(t, out.Text, "Leo")
}

func TestHandleUpdate_tomorrow(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-21T10:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnTomorrow,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "На завтра")
	assert.Contains(t, out.Text, "Leo")
	kb, ok := out.ReplyMarkup.(*models.ReplyKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, btnTomorrow, kb.Keyboard[0][1].Text)
	assert.Equal(t, btnSlots, kb.Keyboard[1][1].Text)
}

func TestHandleUpdate_tutorSlots(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		openSlots: &tutorapi.OpenSlots{
			Timezone: "UTC",
			Days: []tutorapi.OpenSlotsDay{{
				Date: "2026-07-21",
				Ranges: []tutorapi.OpenSlotRange{
					{StartHour: 10, EndHour: 12},
				},
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnSlots,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Свободные слоты")
	assert.Contains(t, out.Text, "10:00")
}

func TestHandleUpdate_buttonToday(t *testing.T) {
	msg := &mockMessenger{}
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

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnToday,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Leo")
	require.IsType(t, &models.ReplyKeyboardMarkup{}, out.ReplyMarkup)
}

func TestHandleUpdate_buttonLinkPrompt(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "код")
	assert.Equal(t, pendingLink, b.chats.pending(1))
}

func TestHandleUpdate_linkTwoStep(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))
	require.Len(t, msg.messages(), 1)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "ab12",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	assert.Equal(t, "ab12", mon.linkIn.Code)
	assert.Equal(t, int64(99), mon.linkIn.TelegramUserID)
	assert.Equal(t, "fedor", mon.linkIn.TelegramUsername)
	assert.Equal(t, pendingNone, b.chats.pending(99))
	assert.Equal(t, roleTutor, b.chats.role(99))

	out := msg.messages()[1]
	assert.Contains(t, out.Text, "Anna")
}

func TestHandleUpdate_linkTwoStep_failureStillReplies(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		linkErr: &tutorapi.Error{Code: "NOT_FOUND", Message: "Link code not found", Status: 404},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "bad99",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	require.Len(t, msg.messages(), 2)
	out := msg.messages()[1]
	assert.NotEmpty(t, out.Text)
	assert.Equal(t, pendingLink, b.chats.pending(99))
}

func TestHandleUpdate_remembersChat(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/help",
			Chat: models.Chat{ID: 42},
			From: &models.User{ID: 7},
		},
	}))

	chats := b.chats.snapshot()
	assert.Equal(t, int64(42), chats[7])
}

func TestHandleUpdate_ignoresNonCommand(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "hello",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))
	assert.Empty(t, msg.messages())
	assert.Equal(t, int64(7), b.chats.snapshot()[1])
}

func TestHandleUpdate_studentStart(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{
		notLink: true,
		student: &tutorapi.BotStudent{
			Name:      "Leo",
			TutorName: "Anna",
			Timezone:  "UTC",
			Balance:   tutorapi.StudentBalance{Prepaid: 5, Currency: "EUR", BalanceKind: "money"},
		},
	}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/start",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 55, Username: "leo_student"},
		},
	}))

	assert.Equal(t, "leo_student", mon.registerIn.TelegramUsername)
	assert.Equal(t, roleStudent, b.chats.role(55))
	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Leo")
	assert.Contains(t, out.Text, "Баланс")
	kb, ok := out.ReplyMarkup.(*models.ReplyKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, btnBalance, kb.Keyboard[1][1].Text)
	assert.Equal(t, btnSlots, kb.Keyboard[1][0].Text)
}

func TestHandleUpdate_studentStartNotFound(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		notLink:     true,
		registerErr: &tutorapi.Error{Code: "NOT_FOUND", Message: "Student not found", Status: 404},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/start",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 55, Username: "unknown_user"},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "не найден")
}

func TestHandleUpdate_studentWeek(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		notLink: true,
		student: &tutorapi.BotStudent{Name: "Leo", TutorName: "Anna", Timezone: "UTC"},
		studentToday: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T14:00:00Z",
				DurationMin: 60,
				Status:      "planned",
			}},
		},
	})
	b.chats.setRole(1, roleStudent)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/week",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1, Username: "leo"},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.Text, "Уроки на неделю")
	assert.Contains(t, out.Text, "запланирован")
	assert.NotContains(t, out.Text, "— Leo")
}

func TestRun_stopsOnContextCancel(t *testing.T) {
	msg := &mockMessenger{}
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

func TestResolveInput(t *testing.T) {
	cmd, arg := resolveInput(btnWeek)
	assert.Equal(t, "/week", cmd)
	assert.Equal(t, "", arg)

	cmd, arg = resolveInput(btnTomorrow)
	assert.Equal(t, "/tomorrow", cmd)

	cmd, arg = resolveInput(btnSlots)
	assert.Equal(t, "/slots", cmd)

	cmd, arg = resolveInput("/link@Bot AB12")
	assert.Equal(t, "/link", cmd)
	assert.Equal(t, "AB12", arg)

	cmd, arg = resolveInput("hello")
	assert.Equal(t, "", cmd)
	assert.Equal(t, "", arg)
}

func TestNew_requiresTelegramClientOrToken(t *testing.T) {
	_, err := New(Config{
		Monitor: &mockMonitor{},
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	require.Error(t, err)
}
