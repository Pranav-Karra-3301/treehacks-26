# Frontend (Next.js)

## Run locally

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Environment

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_WS_URL=ws://localhost:3001
```

Use `https://...` / `wss://...` for deployed/secure environments.

## Pages

- `/` - create negotiation task and start a call
- `/call/[id]` - live call monitor (WebSocket transcript + status)
- `/history` - task history
- `/history/[id]` - call-level detail + post-call analysis
