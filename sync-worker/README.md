# Canvas Sync Worker (Cloudflare)

Personal real-time sync backend for the Canvas (Excalidraw fork):
- **Durable Object (`CanvasHub`) with SQLite**: stores all boards, stores pasted screenshots/images in chunked SQLite rows, and broadcasts live drawing updates over WebSockets.

## Deploy steps

1. Install dependencies and log into Cloudflare:
   ```bash
   cd sync-worker
   npm install
   npx wrangler login
   ```

2. Set your private access passcode as a Worker secret:
   ```bash
   npx wrangler secret put SYNC_TOKEN
   ```

3. Deploy the Worker:
   ```bash
   npx wrangler deploy
   ```
   Copy the deployed URL (e.g. `https://canvas-sync.<your-subdomain>.workers.dev`).

4. Configure Vercel:
   - Add environment variable `VITE_APP_SYNC_URL` = `https://canvas-sync.<your-subdomain>.workers.dev`
   - Redeploy `https://canvas-excalidraw.vercel.app`.

5. Unlock on your Mac and tablet (once per device):
   Open `https://canvas-excalidraw.vercel.app`, enter your `SYNC_TOKEN` passcode in the lock screen, and you're in.
   The passcode is validated against `/api/auth/verify` and saved in `localStorage` so future visits open straight into your synced canvas.
