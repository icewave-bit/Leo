package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

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

	monitor := tutorapi.NewClient(tutorapi.ClientConfig{
		BaseURL:  opts.apiURL,
		BotToken: opts.botAPIToken,
	})

	leoBot, err := bot.New(bot.Config{
		TelegramToken: opts.telegramToken,
		Monitor:       monitor,
		Logger:        logger,
		PollInterval:  opts.pollInterval,
	})
	if err != nil {
		return err
	}

	logger.Info("starting", "poll_interval", opts.pollInterval.String())

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	return leoBot.Run(ctx)
}
