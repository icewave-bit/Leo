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
	Tomorrow(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	Week(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	OpenSlots(ctx context.Context, telegramUserID int64) (tutorapi.OpenSlots, error)
	Students(ctx context.Context, telegramUserID int64) ([]tutorapi.Student, error)
	Debt(ctx context.Context, telegramUserID int64) ([]tutorapi.Student, error)

	RegisterStudent(ctx context.Context, in tutorapi.StudentRegisterInput) (tutorapi.BotStudent, error)
	StudentMe(ctx context.Context, telegramUserID int64) (tutorapi.BotStudent, error)
	StudentWeek(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	StudentToday(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error)
	StudentBalance(ctx context.Context, telegramUserID int64) (tutorapi.StudentBalance, error)
	StudentOpenSlots(ctx context.Context, telegramUserID int64) (tutorapi.OpenSlots, error)
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
		// Clear BotFather/API command menu — we use the reply keyboard instead.
		if _, err := tg.DeleteMyCommands(context.Background(), &telegram.DeleteMyCommandsParams{}); err != nil {
			return nil, fmt.Errorf("clear telegram commands: %w", err)
		}
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

	userID := update.Message.From.ID
	chatID := update.Message.Chat.ID
	b.chats.remember(userID, chatID)

	req := commandRequest{
		telegramUserID: userID,
		username:       update.Message.From.Username,
	}

	var text string
	var err error

	if b.chats.pending(userID) == pendingLink {
		if cmd, _ := resolveInput(update.Message.Text); cmd == "" {
			text, err = b.linkWithCode(ctx, req, strings.TrimSpace(update.Message.Text))
		} else {
			b.chats.clearPending(userID)
		}
	}

	if text == "" {
		cmd, arg := resolveInput(update.Message.Text)
		if cmd == "" {
			return nil
		}
		req.cmd = cmd
		req.arg = arg
		text, err = b.dispatch(ctx, req)
	}
	if err != nil {
		text = userFacingError(err)
	}

	role := b.chats.role(userID)
	reply := &telegram.SendMessageParams{
		ChatID:      chatID,
		Text:        text,
		ReplyMarkup: keyboardForRole(role),
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
		return b.startOrHelp(ctx, req)
	case "/link":
		return b.link(ctx, req)
	case "/me":
		return b.me(ctx, req)
	case "/today":
		return b.today(ctx, req)
	case "/tomorrow":
		return b.tomorrow(ctx, req)
	case "/week":
		return b.week(ctx, req)
	case "/balance":
		return b.studentBalance(ctx, req)
	case "/slots":
		return b.slots(ctx, req)
	case "/students":
		return b.students(ctx, req.telegramUserID)
	case "/debt":
		return b.debt(ctx, req.telegramUserID)
	default:
		return "Неизвестная команда. Нажмите /help", nil
	}
}

func (b *Bot) startOrHelp(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err == nil && role == roleTutor {
		b.chats.setRole(req.telegramUserID, roleTutor)
		return helpTextTutor(), nil
	}

	if req.cmd == "/start" {
		return b.registerStudent(ctx, req)
	}

	if err == nil && role == roleStudent {
		b.chats.setRole(req.telegramUserID, roleStudent)
		return helpTextStudent(), nil
	}
	return helpTextGuest(), nil
}

func (b *Bot) registerStudent(ctx context.Context, req commandRequest) (string, error) {
	if strings.TrimSpace(req.username) == "" {
		return "Чтобы бот нашёл вас, задайте @username в настройках Telegram и снова нажмите /start", nil
	}

	student, err := b.monitor.RegisterStudent(ctx, tutorapi.StudentRegisterInput{
		TelegramUserID:   req.telegramUserID,
		TelegramUsername: req.username,
	})
	if err != nil {
		var apiErr *tutorapi.Error
		if errors.As(err, &apiErr) && apiErr.NotFound() {
			return "Ученик не найден. Попросите репетитора указать ваш Telegram @username в LeO.", nil
		}
		return "", err
	}
	b.chats.setRole(req.telegramUserID, roleStudent)
	return fmt.Sprintf("Привет, %s! Аккаунт привязан к репетитору %s.\n\n%s",
		student.Name, student.TutorName, helpTextStudent()), nil
}

func (b *Bot) resolveRole(ctx context.Context, telegramUserID int64) (botRole, error) {
	if role := b.chats.role(telegramUserID); role != roleUnknown {
		return role, nil
	}
	if _, err := b.monitor.Me(ctx, telegramUserID); err == nil {
		b.chats.setRole(telegramUserID, roleTutor)
		return roleTutor, nil
	} else {
		var apiErr *tutorapi.Error
		if !errors.As(err, &apiErr) || !apiErr.NotLinked() {
			return roleUnknown, err
		}
	}
	if _, err := b.monitor.StudentMe(ctx, telegramUserID); err == nil {
		b.chats.setRole(telegramUserID, roleStudent)
		return roleStudent, nil
	} else {
		var apiErr *tutorapi.Error
		if !errors.As(err, &apiErr) || !apiErr.NotLinked() {
			return roleUnknown, err
		}
	}
	return roleUnknown, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (b *Bot) link(ctx context.Context, req commandRequest) (string, error) {
	code := strings.TrimSpace(req.arg)
	if code == "" {
		b.chats.setPending(req.telegramUserID, pendingLink)
		return strings.TrimSpace(`
Введите код из LeO (Настройки → Telegram).
Отправьте его следующим сообщением.`), nil
	}
	return b.linkWithCode(ctx, req, code)
}

func (b *Bot) linkWithCode(ctx context.Context, req commandRequest, code string) (string, error) {
	if code == "" {
		return "Код не может быть пустым. Нажмите «Привязать» и попробуйте снова.", nil
	}

	tutor, err := b.monitor.Link(ctx, tutorapi.LinkInput{
		Code:             code,
		TelegramUserID:   req.telegramUserID,
		TelegramUsername: req.username,
	})
	if err != nil {
		return "", err
	}
	b.chats.clearPending(req.telegramUserID)
	b.chats.setRole(req.telegramUserID, roleTutor)
	return fmt.Sprintf("Аккаунт привязан: %s", tutor.Name), nil
}

func (b *Bot) me(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	if role == roleStudent {
		student, err := b.monitor.StudentMe(ctx, req.telegramUserID)
		if err != nil {
			return "", err
		}
		return b.formatBotStudent(student), nil
	}
	tutor, err := b.monitor.Me(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatTutor(tutor), nil
}

func (b *Bot) today(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	if role == roleStudent {
		schedule, err := b.monitor.StudentToday(ctx, req.telegramUserID)
		if err != nil {
			return "", err
		}
		return b.formatStudentSchedule("Уроки на сегодня", schedule), nil
	}
	schedule, err := b.monitor.Today(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatSchedule("На сегодня", schedule), nil
}

func (b *Bot) tomorrow(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	if role == roleStudent {
		return "Команда доступна репетиторам. Ученикам: /today или /week", nil
	}
	schedule, err := b.monitor.Tomorrow(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatSchedule("На завтра", schedule), nil
}

func (b *Bot) week(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	if role == roleStudent {
		schedule, err := b.monitor.StudentWeek(ctx, req.telegramUserID)
		if err != nil {
			return "", err
		}
		return b.formatStudentSchedule("Уроки на неделю", schedule), nil
	}
	schedule, err := b.monitor.Week(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatSchedule("На неделю", schedule), nil
}

func (b *Bot) studentBalance(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	if role != roleStudent {
		return "Команда доступна ученикам. Репетиторам: /students или /debt", nil
	}
	bal, err := b.monitor.StudentBalance(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	return b.formatBalance(bal), nil
}

func (b *Bot) slots(ctx context.Context, req commandRequest) (string, error) {
	role, err := b.resolveRole(ctx, req.telegramUserID)
	if err != nil {
		return "", err
	}
	var slots tutorapi.OpenSlots
	if role == roleStudent {
		slots, err = b.monitor.StudentOpenSlots(ctx, req.telegramUserID)
	} else {
		slots, err = b.monitor.OpenSlots(ctx, req.telegramUserID)
	}
	if err != nil {
		return "", err
	}
	return b.formatOpenSlots(slots), nil
}

func (b *Bot) students(ctx context.Context, telegramUserID int64) (string, error) {
	list, err := b.monitor.Students(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	b.chats.setRole(telegramUserID, roleTutor)
	return b.formatStudents("Ученики", list), nil
}

func (b *Bot) debt(ctx context.Context, telegramUserID int64) (string, error) {
	list, err := b.monitor.Debt(ctx, telegramUserID)
	if err != nil {
		return "", err
	}
	b.chats.setRole(telegramUserID, roleTutor)
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

func helpTextTutor() string {
	return strings.TrimSpace(`
LeO — пользуйтесь кнопками внизу:
Сегодня / Завтра / Неделя — расписание
Слоты — свободные места
Ученики / Долги — балансы
Справка — эта подсказка

Настройки уведомлений — в LeO: Настройки → Telegram → Уведомления
`)
}

func helpTextStudent() string {
	return strings.TrimSpace(`
LeO для ученика — кнопки внизу:
Сегодня / Неделя — уроки
Слоты — свободные места репетитора
Баланс — предоплата и долг
Справка — эта подсказка

Напоминания о уроках приходят автоматически за 30 минут.
`)
}

func helpTextGuest() string {
	return strings.TrimSpace(`
LeO бот
• Ученик: попросите репетитора указать ваш @username в LeO и нажмите /start
• Репетитор: создайте код в настройках LeO и нажмите «Привязать»
`)
}

func helpText() string {
	return helpTextTutor()
}

func userFacingError(err error) string {
	var apiErr *tutorapi.Error
	if errors.As(err, &apiErr) {
		if apiErr.NotLinked() {
			return "Telegram не привязан. Ученикам: /start. Репетиторам: нажмите «Привязать»"
		}
		if apiErr.NotFound() {
			return "Ученик не найден. Попросите репетитора указать ваш Telegram @username в LeO."
		}
		if apiErr.Message != "" {
			return apiErr.Message
		}
	}
	return "Не удалось выполнить запрос. Попробуйте позже."
}
