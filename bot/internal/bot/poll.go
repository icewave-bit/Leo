package bot

import (
	"context"
	"errors"
	"fmt"
	"time"

	telegram "github.com/go-telegram/bot"

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
			if err := b.pollOnce(ctx, time.Now()); err != nil {
				b.logger.Error("poll tick", "err", err)
			}
		}
	}
}

func (b *Bot) pollOnce(ctx context.Context, now time.Time) error {
	chats := b.chats.snapshot()
	if len(chats) == 0 {
		return nil
	}

	var firstErr error
	for userID, chatID := range chats {
		if err := b.pollUser(ctx, userID, chatID, now); err != nil {
			b.logger.Error("poll user", "telegram_user_id", userID, "err", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

func (b *Bot) pollUser(ctx context.Context, telegramUserID, chatID int64, now time.Time) error {
	tutor, err := b.monitor.Me(ctx, telegramUserID)
	if err != nil {
		var apiErr *tutorapi.Error
		if errors.As(err, &apiErr) && apiErr.NotLinked() {
			return nil
		}
		return err
	}

	if !tutor.TelegramNotify.Enabled {
		return nil
	}
	if !tutor.TelegramNotify.Lessons {
		return nil
	}
	// telegramNotify.personal is stored in LeO for future personal-event reminders; no bot action yet.

	schedule, err := b.monitor.Today(ctx, telegramUserID)
	if err != nil {
		var apiErr *tutorapi.Error
		if errors.As(err, &apiErr) && apiErr.NotLinked() {
			return nil
		}
		return err
	}

	for _, lesson := range schedule.Lessons {
		if err := b.maybeRemind(ctx, chatID, lesson, schedule.Timezone, now, tutor.TelegramNotify); err != nil {
			return err
		}
	}
	return nil
}

func (b *Bot) maybeRemind(ctx context.Context, chatID int64, lesson tutorapi.Lesson, timezone string, now time.Time, notify tutorapi.TelegramNotify) error {
	if lesson.Status != "planned" {
		return nil
	}

	start, err := time.Parse(time.RFC3339, lesson.StartUTC)
	if err != nil {
		return fmt.Errorf("parse lesson start: %w", err)
	}

	lead := time.Duration(notify.LeadMinutes) * time.Minute
	if lead <= 0 {
		return nil
	}

	windowStart := start.Add(-lead)
	if now.Before(windowStart) || !now.Before(start) {
		return nil
	}

	key := b.reminderKey(chatID, lesson)
	if b.sent.seenOrMark(key) {
		return nil
	}

	text := b.formatReminder(lesson, timezone, lead)
	msg := &telegram.SendMessageParams{
		ChatID:              chatID,
		Text:                text,
		DisableNotification: notify.Silent,
	}
	if _, err := b.api.SendMessage(ctx, msg); err != nil {
		return fmt.Errorf("send reminder: %w", err)
	}
	return nil
}

func (b *Bot) reminderKey(chatID int64, lesson tutorapi.Lesson) string {
	if lesson.ID != "" {
		return fmt.Sprintf("%d:%s", chatID, lesson.ID)
	}
	return fmt.Sprintf("%d:%s:%s", chatID, lesson.StartUTC, lesson.StudentName)
}

func (b *Bot) formatReminder(lesson tutorapi.Lesson, timezone string, lead time.Duration) string {
	when := formatInZone(lesson.StartUTC, timezone, "15:04")
	return fmt.Sprintf("Напоминание: через %s урок с %s (%s)",
		formatLead(lead),
		lesson.StudentName,
		when,
	)
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
