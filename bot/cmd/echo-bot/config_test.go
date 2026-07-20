package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDurationEnv_default(t *testing.T) {
	t.Setenv("POLL_INTERVAL", "")
	got, err := parseDurationEnv("POLL_INTERVAL", time.Minute)
	require.NoError(t, err)
	assert.Equal(t, time.Minute, got)
}

func TestParseDurationEnv_custom(t *testing.T) {
	t.Setenv("POLL_INTERVAL", "30s")
	got, err := parseDurationEnv("POLL_INTERVAL", time.Minute)
	require.NoError(t, err)
	assert.Equal(t, 30*time.Second, got)
}

func TestParseDurationEnv_zeroDisables(t *testing.T) {
	t.Setenv("POLL_INTERVAL", "0s")
	got, err := parseDurationEnv("POLL_INTERVAL", time.Minute)
	require.NoError(t, err)
	assert.Equal(t, time.Duration(0), got)
}
