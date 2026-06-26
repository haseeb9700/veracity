# Veracity v2 — Setup Guide

## What's new in v2
- **User auth** — JWT login/signup, all runs are user-scoped
- **RAG chat** — Ask questions about your data via the "Ask AI" button
- **Production-ready** — Docker support, env config, proper error handling

---

## Quick Start (local dev)

### 1. Backend

```bash
cd backend

# Create .env from template
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY and a random SECRET_KEY

# Install dependencies
pip install -r requirements.txt

# Start the server (auto-creates DB + seeds knowledge base)
uvicorn main:app --reload
```

### 2. Frontend

```bash
cd frontend

# Create env file
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local

# Install and run
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to login. Create an account and you're in.

---

## Docker (production)

```bash
# Copy and fill in your env
cp backend/.env.example backend/.env

# Build and run everything
docker-compose up --build
```

---

## Key endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | None | Create account |
| POST | `/auth/login` | None | Get JWT token |
| GET | `/auth/me` | Bearer | Current user |
| POST | `/upload` | Bearer | Analyse CSV |
| GET | `/runs` | Bearer | Your analysis history |
| GET | `/runs/{id}` | Bearer | Single run detail |
| POST | `/chat` | Bearer | RAG chat query |

---

## RAG Architecture

On each upload, Veracity:
1. Embeds opportunities, bottlenecks, AI report, and clusters into **ChromaDB**
2. Embeds a sample of the raw CSV rows
3. Embeds domain knowledge (SLA standards, automation ROI benchmarks, etc.)

When you chat, it:
1. Embeds your question
2. Retrieves top-k relevant chunks (prioritising current run)
3. Generates a grounded answer via OpenAI — no hallucinated numbers

---

## Generating a SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
