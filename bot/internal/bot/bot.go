package bot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

type Monitor interface {
	Link(ctx context.Context, in tutorapi.LinkInput) (tutorapi.Tutor, error)
	Me(ctx context.Context, telegramUserID int64) (tutorapi.Tutor, error)
	Today(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	Week(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	Students(ctx context.Context, telegramUserID int64) ([]tutorapi.Student, error)
	Debt(ctx context.Context, telegramUserID int64) ([]tutorapi.Student, error)
}

type TelegramClient interface {
	SendMessage(ctx context.Context, params *telegram.SendMessageParams) (*models.Message, error)
	Start(ctx context.Context)
}

type Bot struct {
	api          TelegramClient
	monitor      Monitor
	logger       *slog.Logger
	pollInterval time.Duration
	chats        *chatRegistry
	sent         *sentReminders
}

type Config struct {
	TelegramClient TelegramClient
	TelegramToken  string
	Monitor        Monitor
	Logger         *slog.Logger
	PollInterval   time.Duration
}

func New(cfg Config) (*Bot, error) {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	b := &Bot{
		monitor:      cfg.Monitor,
		logger:       cfg.Logger,
		pollInterval: cfg.PollInterval,
		chats:        newChatRegistry(),
		sent:         newSentReminders(),
	}

	switch {
	case cfg.TelegramClient != nil:
		b.api = cfg.TelegramClient
	case cfg.TelegramToken != "":
		tg, err := telegram.New(cfg.TelegramToken, telegram.WithDefaultHandler(func(ctx context.Context, _ *telegram.Bot, update *models.Update) {
			if err := b.handleUpdate(ctx, update); err != nil {
				b.logger.Error("handle update", "err", err)
			}
		}))
		if err != nil {
			return nil, fmt.Errorf("create telegram bot: %w", err)
		}
		me, err := tg.GetMe(context.Background())
		if err != nil {
			return nil, fmt.Errorf("get telegram bot user: %w", err)
		}
		b.logger.Info("telegram authorized", "username", me.Username)
		b.api = tg
	default:
		return nil, errors.New("TelegramClient or TelegramToken is required")
	}

	return b, nil
}

func (b *Bot) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		errCh <- b.runUpdates(ctx)
	}()
	go func() {
		if err := b.runPoll(ctx); err != nil && !errors.Is(err, context.Canceled) {
			b.logger.Error("poll stopped", "err", err)
		}
	}()
	return <-errCh
}

func (b *Bot) runUpdates(ctx context.Context) error {
	b.api.Start(ctx)
	return ctx.Err()
}

func (b *Bot) handleUpdate(ctx context.Context, update *models.Update) error {
	if update.Message == nil || update.Message.Text == "" || update.Message.From == nil {
		return nil
	}

	b.chats.remember(update.Message.From.ID, update.Message.Chat.ID)

	cmd, arg := parseCommand(update.Message.Text)
	if cmd == "" {
		return nil
	}

	text, err := b.dispatch(ctx, commandRequest{
		cmd:            cmd,
		arg:            arg,
		telegramUserID: update.Message.From.ID,
		username:       update.Message.From.Username,
	})
	if err != nil {
		text = userFacingError(err)
	}

	reply := &telegram.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   text,
	}
	if _, err := b.api.SendMessage(ctx, reply); err != nil {
		return fmt.Errorf("send message: %w", err)
	}
	return nil
}

type commandRequest struct {
	cmd            string
	arg            string
	telegramUserID int64
	username       string
}

func (b *Bot) dispatch(ctx context.Context, req commandRequest) (string, error) {
	switch req.cmd {
	case "/help", "/start":
		if req.arg != "" {
			return b.link(ctx, req)
		}
		return helpText(), nil
	case "/link":
		return b.link(ctx, req)
	case "/me":
		return b.me(ctx, req.telegramUserID)
	case "/today":
		return b.today(ctx, req.telegramUserID)
	case "/week":
		return b.week(ctx, req.telegramUserID)
	case "/students":
		return b.students(ctx, req.telegramUserID)
	case "/debt":
		return b.debt(ctx, req.telegramUserID)
	default:
		return "Неизвестная команда. Нажмите /help", nil
	}
}

func (b *Bot) link(ctx context.Context, req commandRequest) (string, error) {
	code := strings.TrimSpace(req.arg)
	if code == "" {
		return "Укажите код из LeO: /link КОД", nil
	}

	tutor, err := b.monitor.Link(ctx, tutorapi.LinkInput{
		Code:             code,
		TelegramUserID:   req.telegramUserID,
		TelegramUsername: req.username,
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Аккаунт привязан: %s", tutor.Name), nil
}

func (b *Bot) me(ctx context.Context, telegramUserID int64) (string, error) {
	tutor, err := b.monitor.Me(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatTutor(tutor), nil
}

func (b *Bot) today(ctx context.Context, telegramUserID int64) (string, error) {
	schedule, err := b.monitor.Today(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatSchedule("Уроки на сегодня", schedule), nil
}

func (b *Bot) week(ctx context.Context, telegramUserID int64) (string, error) {
	schedule, err := b.monitor.Week(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatSchedule("Уроки на неделю", schedule), nil
}

func (b *Bot) students(ctx context.Context, telegramUserID int64) (string, error) {
	list, err := b.monitor.Students(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatStudents("Ученики", list), nil
}

func (b *Bot) debt(ctx context.Context, telegramUserID int64) (string, error) {
	list, err := b.monitor.Debt(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatStudents("Долги", list), nil
}

func parseCommand(text string) (cmd, arg string) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/") {
		return "", ""
	}
	parts := strings.Fields(text)
	cmd = strings.ToLower(parts[0])
	if at := strings.IndexByte(cmd, '@'); at >= 0 {
		cmd = cmd[:at]
	}
	if len(parts) > 1 {
		arg = strings.Join(parts[1:], " ")
	}
	return cmd, arg
}

func helpText() string {
	return strings.TrimSpace(`
LeO — команды:
/link КОД — привязать аккаунт (код в настройках LeO)
/me — профиль
/today — уроки на сегодня
/week — уроки на неделю
/students — ученики и балансы
/debt — ученики с долгом
/help — эта справка

Настройки уведомлений — в LeO: Настройки → Telegram → Уведомления
`)
}

func userFacingError(err error) string {
	var apiErr *tutorapi.Error
	if errors.As(err, &apiErr) {
		if apiErr.NotLinked() {
			return "Telegram не привязан. Откройте настройки LeO, создайте код и отправьте /link КОД"
		}
		if apiErr.Message != "" {
			return apiErr.Message
		}
	}
	return "Не удалось выполнить запрос. Попробуйте позже."
}
