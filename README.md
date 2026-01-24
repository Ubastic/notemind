# NoteMind

Minimal AI-assisted notes app with encrypted content, fast capture, and smart metadata.

## Features

- Fast capture with AI category, tags, summary, and sensitivity
- Encrypted note content at rest (AES-GCM, key derived from password hash + salt)
- File attachments (images, documents) support
- Todo status tracking (mark notes as completed)
- JWT auth stored in the browser for persistent sessions
- Timeline, category views, search, random, and share links

## Project layout

- `backend/` FastAPI API server (SQLite)
- `frontend/` React + Vite UI
- `deploy/` Deployment scripts (PowerShell for Windows -> Linux) and configs (Nginx, PM2)

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
- `LLM_PROVIDER` AI provider (dashscope, openai, etc.)
- `LLM_API_KEY` API key for the LLM provider
- `LLM_API_BASE_URL` Base URL for the LLM API
- `LLM_CHAT_MODEL` Chat model name (e.g., qwen-plus, gpt-4)
- `LLM_EMBED_MODEL` Embedding model name
- `SEMANTIC_SIMILARITY_THRESHOLD` Threshold for semantic search (default 0.2)
 
## Ubuntu deployment (example)

```bash
mkdir -p /opt/notemind
cp -r backend /opt/notemind/backend
cp -r frontend/dist /opt/notemind/frontend/dist
```

- Use `deploy/nginx.conf` for the reverse proxy
- Use `deploy/pm2.config.js` to run the API with PM2
- Windows users can use `deploy/deploy.ps1` (full) or `deploy/deployfront.ps1` (frontend only) to deploy to a remote server via SSH.
 

## Notes

- Search uses AI summaries and tags because content is encrypted at rest.
- If AI is not configured, the API falls back to heuristic tagging.
