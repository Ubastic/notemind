# NoteMind

Minimal AI-assisted notes app with encrypted content, fast capture, and smart metadata.

## Features

- Fast capture with AI category, tags, summary, and sensitivity
- Encrypted note content at rest (AES-GCM, key derived from password hash + salt)
- JWT auth stored in the browser for persistent sessions
- Timeline, category views, search, random, and share links

## Project layout

- `backend/` FastAPI API server (SQLite)
- `frontend/` React + Vite UI
- `deploy/` Ubuntu deployment examples (Nginx, PM2)

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

## Environment variables

- `JWT_SECRET` JWT signing secret
- `JWT_EXPIRE_DAYS` Access token expiry
- `DATABASE_URL` SQLite path or other DB URL
- `CORS_ORIGINS` Comma-separated origins
- `DASHSCOPE_API_KEY` Optional Qwen API key for AI analysis

## Ubuntu deployment (example)

```bash
mkdir -p /opt/notemind
cp -r backend /opt/notemind/backend
cp -r frontend/dist /opt/notemind/frontend/dist
```

- Use `deploy/nginx.conf` for the reverse proxy
- Use `deploy/pm2.config.js` to run the API with PM2

## Notes

- Search uses AI summaries and tags because content is encrypted at rest.
- If Qwen is not configured, the API falls back to heuristic tagging.
