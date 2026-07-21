package bot

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewTelegramHTTPClient_direct(t *testing.T) {
	client, err := newTelegramHTTPClient("", time.Minute)
	require.NoError(t, err)
	assert.Nil(t, client.Transport)
	assert.Equal(t, time.Minute, client.Timeout)
}

func TestNewTelegramHTTPClient_socks5h(t *testing.T) {
	client, err := newTelegramHTTPClient("socks5h://100.115.21.125:1080", time.Minute)
	require.NoError(t, err)
	tr, ok := client.Transport.(*http.Transport)
	require.True(t, ok)
	require.NotNil(t, tr.Proxy)
	req, err := http.NewRequest(http.MethodGet, "https://api.telegram.org", nil)
	require.NoError(t, err)
	proxyURL, err := tr.Proxy(req)
	require.NoError(t, err)
	require.NotNil(t, proxyURL)
	assert.Equal(t, "socks5h", proxyURL.Scheme)
	assert.Equal(t, "100.115.21.125:1080", proxyURL.Host)
}

func TestNewTelegramHTTPClient_rejectsBadScheme(t *testing.T) {
	_, err := newTelegramHTTPClient("ftp://proxy:1080", time.Minute)
	require.Error(t, err)
}
