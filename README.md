# Tutor Monitor

Multi-tenant SaaS for language tutors. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the full product specification.

## Backend

Auth + scheduler API lives in [`server/`](server/). See [server/README.md](server/README.md) for setup, API reference, and tests.

## Frontend

React + Vite + TypeScript UI in [`client/`](client/), wired to the API (session cookies, Jotai state, React Router).

The original static prototype is kept in [`Tutor Monitor Front/`](Tutor%20Monitor%20Front/) for reference.

### Quick start (full stack)

```bash
mise trust && mise install
docker compose up -d

# API
cd server && cp .env.example .env
pnpm install
pnpm migrate
pnpm seed
pnpm dev

# UI (new terminal)
cd client && cp .env.example .env
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5173** — demo login: `anna@tutormonitor.app` / `demo-password-123`

PostgreSQL runs on host port **5433** (to avoid clashing with a local Postgres on 5432).

Ensure `server/.env` has `CORS_ORIGIN=http://127.0.0.1:5173` (see `server/.env.example`).
