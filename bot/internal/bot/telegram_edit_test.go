package bot

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRichEditParams_omitsText(t *testing.T) {
	raw, err := json.Marshal(richEditParams(&telegram.EditMessageTextParams{
		ChatID:    int64(7),
		MessageID: 3,
		Text:      "fallback that must not be sent",
		RichMessage: &models.InputRichMessage{
			Markdown:            "# Hi",
			SkipEntityDetection: true,
		},
	}))
	require.NoError(t, err)
	assert.NotContains(t, string(raw), `"text"`)
	assert.Contains(t, string(raw), `"rich_message"`)
	assert.Contains(t, string(raw), "# Hi")
}

func TestLiveTelegram_editRichMessage(t *testing.T) {
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/bottest-token/editMessageText", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		gotBody = body
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":3}}`))
	}))
	defer srv.Close()

	api := &liveTelegram{
		http:  srv.Client(),
		token: "test-token",
		base:  srv.URL,
	}
	msg, err := api.EditMessageText(context.Background(), &telegram.EditMessageTextParams{
		ChatID:      int64(7),
		MessageID:   3,
		Text:        "must omit",
		RichMessage: &models.InputRichMessage{Markdown: "| День | Свободно |"},
	})
	require.NoError(t, err)
	require.NotNil(t, msg)
	assert.Equal(t, 3, msg.ID)
	assert.NotContains(t, string(gotBody), `"text"`)
	assert.Contains(t, string(gotBody), `"rich_message"`)
}
