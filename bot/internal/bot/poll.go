package bot

import (
	"context"
	"errors"
	"fmt"
	"time"

	telegram "github.com/go-telegram/bot"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

const studentReminderLead = 30 * time.Minute

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
	chats := b.chats.snapshotEntries()
	if len(chats) == 0 {
		return nil
	}

	var firstErr error
	for userID, entry := range chats {
		if err := b.pollUser(ctx, userID, entry, now); err != nil {
			b.logger.Error("poll user", "telegram_user_id", userID, "err", err)
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}

func (b *Bot) pollUser(ctx context.Context, telegramUserID int64, entry chatEntry, now time.Time) error {
	role := entry.role
	if role == roleUnknown {
		resolved, err := b.resolveRole(ctx, telegramUserID)
		if err != nil {
			var apiErr *tutorapi.Error
			if errors.As(err, &apiErr) && apiErr.NotLinked() {
				return nil
			}
			return err
		}
		role = resolved
	}

	switch role {
	case roleTutor:
		return b.pollTutor(ctx, telegramUserID, entry.chatID, now)
	case roleStudent:
		return b.pollStudent(ctx, telegramUserID, entry.chatID, now)
	default:
		return nil
	}
}

func (b *Bot) pollTutor(ctx context.Context, telegramUserID, chatID int64, now time.Time) error {
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
	if !tutor.TelegramNotify.Lessons && !tutor.TelegramNotify.Personal {
		return nil
	}

	schedule, err := b.monitor.Today(ctx, telegramUserID)
	if err != nil {
		var apiErr *tutorapi.Error
		if errors.As(err, &apiErr) && apiErr.NotLinked() {
			return nil
		}
		return err
	}

	if tutor.TelegramNotify.Lessons {
		for _, lesson := range schedule.Lessons {
			if err := b.maybeRemindLesson(ctx, chatID, lesson, schedule.Timezone, now, tutor.TelegramNotify, false); err != nil {
				return err
			}
		}
	}
	if tutor.TelegramNotify.Personal {
		for _, event := range schedule.Events {
			if err := b.maybeRemindPersonal(ctx, chatID, event, schedule.Timezone, now, tutor.TelegramNotify); err != nil {
				return err
			}
		}
	}
	return nil
}

func (b *Bot) pollStudent(ctx context.Context, telegramUserID, chatID int64, now time.Time) error {
	schedule, err := b.monitor.StudentToday(ctx, telegramUserID)
	if err != nil {
		var apiErr *tutorapi.Error
		if errors.As(err, &apiErr) && apiErr.NotLinked() {
			return nil
		}
		return err
	}

	notify := tutorapi.TelegramNotify{
		Enabled:     true,
		LeadMinutes: int(studentReminderLead / time.Minute),
		Silent:      false,
		Lessons:     true,
	}
	for _, lesson := range schedule.Lessons {
		if err := b.maybeRemindLesson(ctx, chatID, lesson, schedule.Timezone, now, notify, true); err != nil {
			return err
		}
	}
	return nil
}

func (b *Bot) maybeRemindLesson(
	ctx context.Context,
	chatID int64,
	lesson tutorapi.Lesson,
	timezone string,
	now time.Time,
	notify tutorapi.TelegramNotify,
	forStudent bool,
) error {
	if lesson.Status != "planned" {
		return nil
	}

	start, err := time.Parse(time.RFC3339, lesson.StartUTC)
	if err != nil {
		return fmt.Errorf("parse lesson start: %w", err)
	}

	lead := time.Duration(notify.LeadMinutes) * time.Minute
	if !inReminderWindow(now, start, lead) {
		return nil
	}

	key := b.lessonReminderKey(chatID, lesson)
	if b.sent.seenOrMark(key) {
		return nil
	}

	text := b.formatLessonReminder(lesson, timezone, lead, forStudent)
	return b.sendReminder(ctx, chatID, text, notify.Silent)
}

func (b *Bot) maybeRemindPersonal(
	ctx context.Context,
	chatID int64,
	event tutorapi.PersonalEvent,
	timezone string,
	now time.Time,
	notify tutorapi.TelegramNotify,
) error {
	start, err := time.Parse(time.RFC3339, event.StartUTC)
	if err != nil {
		return fmt.Errorf("parse personal event start: %w", err)
	}

	lead := time.Duration(notify.LeadMinutes) * time.Minute
	if !inReminderWindow(now, start, lead) {
		return nil
	}

	key := b.personalReminderKey(chatID, event)
	if b.sent.seenOrMark(key) {
		return nil
	}

	text := b.formatPersonalReminder(event, timezone, lead)
	return b.sendReminder(ctx, chatID, text, notify.Silent)
}

func inReminderWindow(now, start time.Time, lead time.Duration) bool {
	if lead <= 0 {
		return false
	}
	windowStart := start.Add(-lead)
	return !now.Before(windowStart) && now.Before(start)
}

func (b *Bot) sendReminder(ctx context.Context, chatID int64, text string, silent bool) error {
	msg := &telegram.SendMessageParams{
		ChatID:              chatID,
		Text:                text,
		DisableNotification: silent,
	}
	if _, err := b.api.SendMessage(ctx, msg); err != nil {
		return fmt.Errorf("send reminder: %w", err)
	}
	return nil
}

func (b *Bot) lessonReminderKey(chatID int64, lesson tutorapi.Lesson) string {
	if lesson.ID != "" {
		return fmt.Sprintf("%d:lesson:%s", chatID, lesson.ID)
	}
	return fmt.Sprintf("%d:lesson:%s:%s", chatID, lesson.StartUTC, lesson.StudentName)
}

func (b *Bot) personalReminderKey(chatID int64, event tutorapi.PersonalEvent) string {
	if event.ID != "" {
		return fmt.Sprintf("%d:personal:%s", chatID, event.ID)
	}
	return fmt.Sprintf("%d:personal:%s:%s", chatID, event.StartUTC, event.Title)
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
