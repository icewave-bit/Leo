package bot

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func (b *Bot) handleCallbackQuery(ctx context.Context, q *models.CallbackQuery) error {
	msg := q.Message.Message
	if msg == nil {
		_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{CallbackQueryID: q.ID})
		return nil
	}

	b.chats.remember(q.From.ID, msg.Chat.ID)

	switch {
	case q.Data == cbSlotsPick:
		_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{CallbackQueryID: q.ID})
		return b.editMessage(ctx, msg.Chat.ID, msg.ID, slotsPickerText, slotsWeekKeyboard())
	case strings.HasPrefix(q.Data, cbSlotsPrefix):
		offset, err := strconv.Atoi(strings.TrimPrefix(q.Data, cbSlotsPrefix))
		if err != nil || offset < 0 || offset > 8 {
			_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{CallbackQueryID: q.ID})
			return nil
		}
		text, markup, err := b.slotsForWeek(ctx, q.From.ID, offset)
		if err != nil {
			_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{
				CallbackQueryID: q.ID,
				Text:            userFacingError(err),
				ShowAlert:       true,
			})
			return nil
		}
		_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{CallbackQueryID: q.ID})
		return b.editMessage(ctx, msg.Chat.ID, msg.ID, text, markup)
	default:
		_, _ = b.api.AnswerCallbackQuery(ctx, &telegram.AnswerCallbackQueryParams{CallbackQueryID: q.ID})
		return nil
	}
}

func (b *Bot) slotsForWeek(ctx context.Context, telegramUserID int64, weekOffset int) (string, *models.InlineKeyboardMarkup, error) {
	role, err := b.resolveRole(ctx, telegramUserID)
	if err != nil {
		return "", nil, err
	}
	var slots tutorapi.OpenSlots
	if role == roleStudent {
		slots, err = b.monitor.StudentOpenSlots(ctx, telegramUserID, weekOffset)
	} else {
		slots, err = b.monitor.OpenSlots(ctx, telegramUserID, weekOffset)
	}
	if err != nil {
		return "", nil, err
	}
	return b.formatOpenSlots(slots, weekOffset), slotsResultKeyboard(weekOffset), nil
}

func (b *Bot) editMessage(ctx context.Context, chatID int64, messageID int, text string, markup *models.InlineKeyboardMarkup) error {
	// text is omitted: sending both text and rich_message makes Telegram
	// treat this as a plain edit and drop tables / date_time.
	_, err := b.api.EditMessageText(ctx, &telegram.EditMessageTextParams{
		ChatID:      chatID,
		MessageID:   messageID,
		RichMessage: &models.InputRichMessage{Markdown: text, SkipEntityDetection: true},
		ReplyMarkup: markup,
	})
	if err != nil && !strings.Contains(err.Error(), "message is not modified") {
		return fmt.Errorf("edit message: %w", err)
	}
	return nil
}
