package bot

import (
	"context"
	"fmt"
	"strings"
	"time"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func (b *Bot) runPoll(ctx context.Context) error {
	if b.pollInterval <= 0 {
		<-ctx.Done()
		return ctx.Err()
	}

	b.logger.Info("poll started", "interval", b.pollInterval.String())

	ticker := time.NewTicker(b.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := b.pollOnce(ctx); err != nil {
				b.logger.Error("poll tick", "err", err)
			}
		}
	}
}

func (b *Bot) pollOnce(ctx context.Context) error {
	reminders, err := b.monitor.DueReminders(ctx)
	if err != nil {
		return err
	}

	var sent []tutorapi.SentReminder
	var firstErr error
	for _, reminder := range reminders {
		key := dueReminderKey(reminder)
		if key != "" && b.sent.seen(key) {
			continue
		}

		if err := b.sendDueReminder(ctx, reminder); err != nil {
			b.logger.Error("send reminder", "telegram_user_id", reminder.TelegramUserID, "kind", reminder.Kind, "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}

		if key != "" {
			b.sent.mark(key)
		}
		if entityID := dueEntityID(reminder); entityID != "" {
			sent = append(sent, tutorapi.SentReminder{
				TelegramUserID: reminder.TelegramUserID,
				Kind:           reminder.Kind,
				EntityID:       entityID,
			})
		}
	}

	if len(sent) > 0 {
		if err := b.monitor.MarkRemindersSent(ctx, sent); err != nil {
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

func (b *Bot) sendDueReminder(ctx context.Context, reminder tutorapi.DueReminder) error {
	lead := time.Duration(reminder.LeadMinutes) * time.Minute
	switch reminder.Kind {
	case "lesson":
		if reminder.Lesson == nil {
			return fmt.Errorf("due lesson reminder missing lesson")
		}
		text := b.formatLessonReminder(*reminder.Lesson, reminder.Timezone, lead, reminder.Role == "student")
		return b.sendReminder(ctx, reminder.TelegramUserID, text, reminder.Silent, meetJoinKeyboard(lessonMeetURL(*reminder.Lesson)))
	case "personal":
		if reminder.Event == nil {
			return fmt.Errorf("due personal reminder missing event")
		}
		text := b.formatPersonalReminder(*reminder.Event, reminder.Timezone, lead)
		return b.sendReminder(ctx, reminder.TelegramUserID, text, reminder.Silent, nil)
	default:
		return fmt.Errorf("unknown reminder kind %q", reminder.Kind)
	}
}

func dueReminderKey(reminder tutorapi.DueReminder) string {
	entityID := dueEntityID(reminder)
	if entityID == "" {
		return ""
	}
	return fmt.Sprintf("%d:%s:%s", reminder.TelegramUserID, reminder.Kind, entityID)
}

func dueEntityID(reminder tutorapi.DueReminder) string {
	switch reminder.Kind {
	case "personal":
		if reminder.Event != nil {
			return reminder.Event.ID
		}
	default:
		if reminder.Lesson != nil {
			return reminder.Lesson.ID
		}
	}
	return ""
}

func (b *Bot) sendReminder(
	ctx context.Context,
	chatID int64,
	text string,
	silent bool,
	markup *models.InlineKeyboardMarkup,
) error {
	msg := &telegram.SendMessageParams{
		ChatID:              chatID,
		Text:                text,
		DisableNotification: silent,
	}
	if markup != nil {
		msg.ReplyMarkup = markup
	}
	if _, err := b.api.SendMessage(ctx, msg); err != nil {
		return fmt.Errorf("send reminder: %w", err)
	}
	return nil
}

func meetJoinKeyboard(meetURL string) *models.InlineKeyboardMarkup {
	if meetURL == "" {
		return nil
	}
	if !strings.HasPrefix(meetURL, "http://") && !strings.HasPrefix(meetURL, "https://") {
		return nil
	}
	return &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{{
			{Text: "Подключиться", URL: meetURL},
		}},
	}
}

func (b *Bot) formatLessonReminder(lesson tutorapi.Lesson, timezone string, lead time.Duration, forStudent bool) string {
	when := formatInZone(lesson.StartUTC, timezone, "15:04")
	if forStudent {
		return fmt.Sprintf("Напоминание: через %s урок (%s)", formatLead(lead), when)
	}
	return fmt.Sprintf("Напоминание: через %s урок с %s (%s)",
		formatLead(lead),
		lesson.StudentName,
		when,
	)
}

func lessonMeetURL(lesson tutorapi.Lesson) string {
	if lesson.MeetURL == nil {
		return ""
	}
	return strings.TrimSpace(*lesson.MeetURL)
}

func (b *Bot) formatPersonalReminder(event tutorapi.PersonalEvent, timezone string, lead time.Duration) string {
	when := formatInZone(event.StartUTC, timezone, "15:04")
	return fmt.Sprintf("Напоминание: через %s — %s (%s)", formatLead(lead), event.Title, when)
}

func formatLead(lead time.Duration) string {
	mins := int(lead.Round(time.Minute) / time.Minute)
	if mins <= 0 {
		return lead.String()
	}
	if mins%60 == 0 {
		h := mins / 60
		if h == 1 {
			return "1 час"
		}
		return fmt.Sprintf("%d ч", h)
	}
	return fmt.Sprintf("%d мин", mins)
}
