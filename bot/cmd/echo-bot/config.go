package main

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type options struct {
	telegramToken string
	telegramProxy string
	apiURL        string
	botAPIToken   string
	pollInterval  time.Duration
}

func loadOptions() (options, error) {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return options{}, fmt.Errorf("load .env: %w", err)
	}

	opts := options{
		telegramToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		telegramProxy: strings.TrimSpace(os.Getenv("TELEGRAM_PROXY")),
		apiURL:        strings.TrimSpace(os.Getenv("TUTOR_MONITOR_API_URL")),
		botAPIToken:   os.Getenv("BOT_API_TOKEN"),
	}
	if opts.telegramToken == "" {
		return options{}, fmt.Errorf("TELEGRAM_BOT_TOKEN is not set")
	}
	if opts.apiURL == "" {
		return options{}, fmt.Errorf("TUTOR_MONITOR_API_URL is not set")
	}
	if opts.botAPIToken == "" {
		return options{}, fmt.Errorf("BOT_API_TOKEN is not set")
	}

	pollInterval, err := parseDurationEnv("POLL_INTERVAL", time.Minute)
	if err != nil {
		return options{}, err
	}
	opts.pollInterval = pollInterval

	return opts, nil
}

func parseDurationEnv(key string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}
	if d < 0 {
		return 0, fmt.Errorf("%s must be >= 0", key)
	}
	return d, nil
}
