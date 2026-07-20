package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

	"github.com/fedortarasov/leo-bot/internal/bot"
	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func main() {
	if err := run(); err != nil {
		slog.Error("exit", "err", err)
		os.Exit(1)
	}
}

func run() error {
	opts, err := loadOptions()
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	api, err := tgbotapi.NewBotAPI(opts.telegramToken)
	if err != nil {
		return fmt.Errorf("create bot api: %w", err)
	}

	logger.Info("authorized",
		"username", api.Self.UserName,
		"poll_interval", opts.pollInterval.String(),
	)

	monitor := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  opts.apiURL,
		BotToken: opts.botAPIToken,
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	return bot.New(bot.Config{
		API:          api,
		Monitor:      monitor,
		Logger:       logger,
		PollInterval: opts.pollInterval,
	}).Run(ctx)
}
