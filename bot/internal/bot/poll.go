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
	case "reschedule":
		if reminder.Reschedule == nil {
			return fmt.Errorf("due reschedule reminder missing reschedule")
		}
		text := b.formatLessonReschedule(*reminder.Reschedule, reminder.Timezone, reminder.Role == "student")
		meetURL := ""
		if reminder.Reschedule.MeetURL != nil {
			meetURL = strings.TrimSpace(*reminder.Reschedule.MeetURL)
		}
		return b.sendReminder(ctx, reminder.TelegramUserID, text, reminder.Silent, meetJoinKeyboard(meetURL))
	default:
		return fmt.Errorf("unknown reminder kind %q", reminder.Kind)
	}
}

func dueReminderKey(reminder tutorapi.DueReminder) string {
	entityID := dueEntityID(reminder)
	if entityID == "" {
		return ""
	}
	return fmt.Sprintf("%d:%s:%s:%s", reminder.TelegramUserID, reminder.Kind, entityID, dueStartUTC(reminder))
}

func dueStartUTC(reminder tutorapi.DueReminder) string {
	switch reminder.Kind {
	case "personal":
		if reminder.Event != nil {
			return reminder.Event.StartUTC
		}
	case "reschedule":
		if reminder.Reschedule != nil {
			return reminder.Reschedule.ToStartUTC
		}
	default:
		if reminder.Lesson != nil {
			return reminder.Lesson.StartUTC
		}
	}
	return ""
}

func dueEntityID(reminder tutorapi.DueReminder) string {
	switch reminder.Kind {
	case "personal":
		if reminder.Event != nil {
			return reminder.Event.ID
		}
	case "reschedule":
		if reminder.Reschedule != nil {
			return reminder.Reschedule.ID
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
	msg := &telegram.SendRichMessageParams{
		ChatID:              chatID,
		RichMessage:         richMarkdown(text),
		DisableNotification: silent,
	}
	if markup != nil {
		msg.ReplyMarkup = markup
	}
	if _, err := b.api.SendRichMessage(ctx, msg); err != nil {
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
		InlineKeyboard: [][]models.InlineKeyboardButton{{{
			Text:  "Подключиться",
			URL:   meetURL,
			Style: "primary",
		}}},
	}
}

func (b *Bot) formatLessonReminder(lesson tutorapi.Lesson, timezone string, lead time.Duration, forStudent bool) string {
	when := mdDateTime(lesson.StartUTC, timezone, "15:04", "t")
	var buf strings.Builder
	buf.WriteString(mdHeading("Урок через " + formatLead(lead)))
	buf.WriteByte('\n')
	if !forStudent {
		buf.WriteString("\n**")
		buf.WriteString(mdEscape(lesson.StudentName))
		buf.WriteString("**")
		if lesson.DurationMin > 0 {
			buf.WriteString(fmt.Sprintf(" · %d мин", lesson.DurationMin))
		}
		buf.WriteByte('\n')
	}
	buf.WriteString("\n")
	buf.WriteString(when)
	if lesson.Unpaid {
		buf.WriteString("\n\nне оплачен")
	}
	return buf.String()
}

func lessonMeetURL(lesson tutorapi.Lesson) string {
	if lesson.MeetURL == nil {
		return ""
	}
	return strings.TrimSpace(*lesson.MeetURL)
}

func (b *Bot) formatPersonalReminder(event tutorapi.PersonalEvent, timezone string, lead time.Duration) string {
	when := mdDateTime(event.StartUTC, timezone, "15:04", "t")
	return mdHeading("Через "+formatLead(lead)) + "\n\n**" + mdEscape(event.Title) + "**\n\n" + when
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
