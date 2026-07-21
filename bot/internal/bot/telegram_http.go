package bot

import (
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// newTelegramHTTPClient builds an HTTP client for the Telegram Bot API.
// If proxyURL is empty, the default transport is used (direct).
// Supported proxy schemes: socks5, socks5h, http, https.
func newTelegramHTTPClient(proxyURL string, timeout time.Duration) (*http.Client, error) {
	client := &http.Client{Timeout: timeout}
	if proxyURL == "" {
		return client, nil
	}

	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("parse TELEGRAM_PROXY: %w", err)
	}
	switch u.Scheme {
	case "socks5", "socks5h", "http", "https":
	default:
		return nil, fmt.Errorf("TELEGRAM_PROXY: unsupported scheme %q (use socks5h://, socks5://, http://, or https://)", u.Scheme)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("TELEGRAM_PROXY: missing host")
	}

	client.Transport = &http.Transport{
		Proxy: http.ProxyURL(u),
	}
	return client, nil
}
