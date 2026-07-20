package tutorapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	botToken   string
	httpClient *http.Client
}

type ClientConfig struct {
	BaseURL    string
	BotToken   string
	HTTPClient *http.Client
}

func NewClient(cfg ClientConfig) *Client {
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		botToken:   cfg.BotToken,
		httpClient: httpClient,
	}
}

func (c *Client) Link(ctx context.Context, in LinkInput) (Tutor, error) {
	body := map[string]any{
		"code":           in.Code,
		"telegramUserId": strconv.FormatInt(in.TelegramUserID, 10),
	}
	if in.TelegramUsername != "" {
		body["telegramUsername"] = in.TelegramUsername
	}

	var out struct {
		Tutor Tutor `json:"tutor"`
	}
	if err := c.do(ctx, httpRequest{
		method: http.MethodPost,
		path:   "/api/bot/link",
		body:   body,
	}, &out); err != nil {
		return Tutor{}, err
	}
	return out.Tutor, nil
}

func (c *Client) Me(ctx context.Context, telegramUserID int64) (Tutor, error) {
	var out struct {
		Tutor Tutor `json:"tutor"`
	}
	if err := c.do(ctx, httpRequest{
		method:         http.MethodGet,
		path:           "/api/bot/me",
		telegramUserID: telegramUserID,
	}, &out); err != nil {
		return Tutor{}, err
	}
	return out.Tutor, nil
}

func (c *Client) Today(ctx context.Context, telegramUserID int64) (Schedule, error) {
	var out Schedule
	if err := c.do(ctx, httpRequest{
		method:         http.MethodGet,
		path:           "/api/bot/today",
		telegramUserID: telegramUserID,
	}, &out); err != nil {
		return Schedule{}, err
	}
	return out, nil
}

func (c *Client) Week(ctx context.Context, telegramUserID int64) (Schedule, error) {
	var out Schedule
	if err := c.do(ctx, httpRequest{
		method:         http.MethodGet,
		path:           "/api/bot/week",
		telegramUserID: telegramUserID,
	}, &out); err != nil {
		return Schedule{}, err
	}
	return out, nil
}

func (c *Client) Students(ctx context.Context, telegramUserID int64) ([]Student, error) {
	var out struct {
		Students []Student `json:"students"`
	}
	if err := c.do(ctx, httpRequest{
		method:         http.MethodGet,
		path:           "/api/bot/students",
		telegramUserID: telegramUserID,
	}, &out); err != nil {
		return nil, err
	}
	return out.Students, nil
}

func (c *Client) Debt(ctx context.Context, telegramUserID int64) ([]Student, error) {
	var out struct {
		Students []Student `json:"students"`
	}
	if err := c.do(ctx, httpRequest{
		method:         http.MethodGet,
		path:           "/api/bot/debt",
		telegramUserID: telegramUserID,
	}, &out); err != nil {
		return nil, err
	}
	return out.Students, nil
}

type httpRequest struct {
	method         string
	path           string
	body           any
	telegramUserID int64
}

func (c *Client) do(ctx context.Context, req httpRequest, dest any) error {
	var bodyReader io.Reader
	if req.body != nil {
		payload, err := json.Marshal(req.body)
		if err != nil {
			return fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(payload)
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.method, c.baseURL+req.path, bodyReader)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.botToken)
	if req.body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	if req.telegramUserID != 0 {
		httpReq.Header.Set("X-Telegram-User-Id", strconv.FormatInt(req.telegramUserID, 10))
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return parseAPIError(resp.StatusCode, respBody)
	}
	if dest == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	if err := json.Unmarshal(respBody, dest); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func parseAPIError(status int, body []byte) error {
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil || envelope.Error.Message == "" {
		return &Error{
			Status:  status,
			Message: fmt.Sprintf("api status %d", status),
		}
	}
	return &Error{
		Status:  status,
		Code:    envelope.Error.Code,
		Message: envelope.Error.Message,
	}
}
