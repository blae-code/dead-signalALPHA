# Dead Signal Deployment

## Recommended Topology

Use a single public origin and reverse-proxy the backend under `/api`.

- Frontend: `https://dead-signal.example.com/`
- Backend API: `https://dead-signal.example.com/api`
- Backend websocket: `wss://dead-signal.example.com/api/ws/feed`

This avoids cross-origin cookie issues and lets the frontend run with no `REACT_APP_BACKEND_URL`.

If you must split origins:

- Frontend: `https://dead-signal.example.com`
- Backend: `https://api.dead-signal.example.com`
- Set `REACT_APP_BACKEND_URL=https://api.dead-signal.example.com`
- Set `CORS_ORIGINS=https://dead-signal.example.com`
- Keep `COOKIE_SECURE=true`
- Keep `COOKIE_SAMESITE=none`

## Environment Contract

Backend required:

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `SETUP_SECRET`

Backend required when using Pterodactyl:

- `PTERODACTYL_URL`
- `PTERODACTYL_API_KEY`
- `PTERODACTYL_SERVER_ID`

Backend optional:

- `APP_ENV` default `development`
- `CORS_ORIGINS`
- `COOKIE_SECURE`
- `COOKIE_SAMESITE`
- `COOKIE_DOMAIN`
- `RETURN_AUTH_TOKENS`
- `WRITE_DEBUG_CREDENTIALS`
- `MEMORY_DIR`
- `EMERGENT_LLM_KEY`

Frontend optional:

- `REACT_APP_BACKEND_URL`
- `ENABLE_HEALTH_CHECK`

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example) for exact keys.

## Startup Commands

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'
```

Frontend build:

```bash
cd frontend
npm ci
npm run build
```

If Emergent or your host can serve static assets directly, publish `frontend/build`.

Fallback static serve command:

```bash
cd frontend
npx serve -s build -l ${PORT:-3000}
```

## Reverse Proxy Requirements

- Proxy `/api/*` to the FastAPI backend.
- Proxy `/api/ws/feed` with websocket upgrade support.
- Preserve `Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`.
- Terminate TLS at the proxy or edge.
- If using split origins, do not use `CORS_ORIGINS=*` with browser credentials.

## Health Checks

Backend liveness:

- `GET /api/health/live`

Backend readiness:

- `GET /api/health/ready`

Backend detailed diagnostics:

- `GET /api/health/details`

Readiness fails with `503` when MongoDB is unavailable.

## Smoke Test

Use the env-driven smoke runner:

```bash
export DEAD_SIGNAL_TEST_BASE_URL='https://api.dead-signal.example.com'
export DEAD_SIGNAL_TEST_ADMIN_CALLSIGN='your-admin-callsign'
export DEAD_SIGNAL_TEST_ADMIN_AUTH_KEY='your-admin-auth-key'
python backend_test.py
```

PowerShell:

```powershell
$env:DEAD_SIGNAL_TEST_BASE_URL='https://api.dead-signal.example.com'
$env:DEAD_SIGNAL_TEST_ADMIN_CALLSIGN='your-admin-callsign'
$env:DEAD_SIGNAL_TEST_ADMIN_AUTH_KEY='your-admin-auth-key'
python backend_test.py
```

## Deployment Checklist

1. Set backend secrets and integration env vars from `backend/.env.example`.
2. Decide topology: same-origin preferred, split-origin only if you set explicit `CORS_ORIGINS`.
3. Build the frontend with `npm ci && npm run build`.
4. Start the backend with `uvicorn ... --proxy-headers`.
5. Configure websocket upgrade for `/api/ws/feed`.
6. Verify `GET /api/health/live` returns `200`.
7. Verify `GET /api/health/ready` returns `200`.
8. Run `python backend_test.py` against the deployed backend.
9. Verify login, `/api/auth/me`, `/api/server/status`, `/api/world/state`, and `/api/gm/stats`.
10. Rotate any credentials that were ever committed to source control or test artifacts.
