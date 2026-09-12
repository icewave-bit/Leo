package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

const telegramAPIBase = "https://api.telegram.org"

// liveTelegram wraps the library client so rich edits omit the text field.
type liveTelegram struct {
	*telegram.Bot
	http  *http.Client
	token string
	base  string
}

type richEditMessageParams struct {
	ChatID      any                      `json:"chat_id,omitempty"`
	MessageID   int                      `json:"message_id,omitempty"`
	RichMessage *models.InputRichMessage `json:"rich_message,omitempty"`
	ReplyMarkup models.ReplyMarkup       `json:"reply_markup,omitempty"`
}

func (l *liveTelegram) EditMessageText(ctx context.Context, params *telegram.EditMessageTextParams) (*models.Message, error) {
	if params != nil && params.RichMessage != nil {
		return l.editRichMessage(ctx, params)
	}
	return l.Bot.EditMessageText(ctx, params)
}

func richEditParams(params *telegram.EditMessageTextParams) richEditMessageParams {
	return richEditMessageParams{
		ChatID:      params.ChatID,
		MessageID:   params.MessageID,
		RichMessage: params.RichMessage,
		ReplyMarkup: params.ReplyMarkup,
	}
}

func (l *liveTelegram) editRichMessage(ctx context.Context, params *telegram.EditMessageTextParams) (*models.Message, error) {
	body, err := json.Marshal(richEditParams(params))
	if err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}
	base := l.base
	if base == "" {
		base = telegramAPIBase
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/bot"+l.token+"/editMessageText", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}

	var out struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		Description string          `json:"description"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}
	if !out.OK {
		desc := out.Description
		if desc == "" {
			desc = resp.Status
		}
		return nil, fmt.Errorf("edit message: %s", desc)
	}
	if bytes.Equal(out.Result, []byte("true")) {
		return nil, nil
	}
	msg := &models.Message{}
	if err := json.Unmarshal(out.Result, msg); err != nil {
		return nil, fmt.Errorf("edit message: %w", err)
	}
	return msg, nil
}
