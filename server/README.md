# Tutor Monitor — API Server

Backend for Tutor Monitor (auth + scheduler slice): multi-tenant tutor authentication and lesson scheduling.

## Prerequisites

- [mise](https://mise.jdx.dev/) — installs Node 24 and pnpm from the repo root `mise.toml`
- Docker — local PostgreSQL

```bash
# From repository root
mise install
cd server
cp .env.example .env
```

## Database

From the repository root:

```bash
docker compose up -d
cd server
pnpm migrate
pnpm seed   # optional demo data
```

Demo tutor: `anna@tutormonitor.app` / `demo-password-123`

## Development

```bash
pnpm dev
```

## Tests

Ensure Postgres is running and `TEST_DATABASE_URL` is set (see `.env.example`).

```bash
pnpm test
```

## API

Base path: `/api`. JSON bodies. Session cookie (`connect.sid`) after register/login.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | no | Register tutor, auto-login |
| POST | `/api/auth/login` | no | Login |
| POST | `/api/auth/logout` | yes | Logout |
| GET | `/api/auth/me` | yes | Current tutor |
| GET | `/api/students` | yes | List students |
| GET | `/api/students/:id` | yes | Get student |
| POST | `/api/students` | yes | Create student |
| GET | `/api/lessons?from=&to=` | yes | List lessons in range (ISO UTC) |
| POST | `/api/lessons` | yes | Create lesson |
| PATCH | `/api/lessons/:id` | yes | Update lesson |
| DELETE | `/api/lessons/:id` | yes | Delete lesson |
| GET | `/health` | no | Health + DB ping |

Errors: `{ "error": { "code", "message", "details?" } }`
