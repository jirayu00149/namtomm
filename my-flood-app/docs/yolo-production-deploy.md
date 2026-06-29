# YOLO Production Deploy

The local YOLO service stops when your computer is off. For production, run it on an always-on VPS or GPU server and point the Cloudflare Worker to that public endpoint.

## 1. Server requirements

- Ubuntu 22.04/24.04 VPS
- 2 CPU cores and 4 GB RAM minimum for light traffic
- Public IP address
- Docker and Docker Compose

GPU is optional. The current `flood_water_level.pt` model is small enough to run on CPU for normal report volume.

## 2. Install Docker on the VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Log out and log back in after `usermod`.

## 3. Deploy the service

```bash
git clone <your-repo-url>
cd <your-repo>/my-flood-app
cp tools/yolo-water-service/env.production.example .env
```

Edit `.env` and set a real `YOLO_API_KEY`.

```bash
docker compose -f docker-compose.yolo.yml up -d --build
docker compose -f docker-compose.yolo.yml ps
```

The compose file uses `restart: unless-stopped`, so Docker starts the service again after a VPS reboot.

## 4. Test the VPS service

```bash
curl http://<VPS_IP>:8010/health
```

Expected result:

```json
{"ok":true}
```

For HTTPS, put Caddy or Nginx in front of port `8010`, then use a URL like:

```text
https://yolo.your-domain.com/detect-water-level
```

If you do not have a domain yet, Cloudflare Worker can call:

```text
http://<VPS_IP>:8010/detect-water-level
```

Use `YOLO_API_KEY` if exposing the service directly.

## 5. Point Cloudflare Worker to the VPS

Run this from `my-flood-app` on your development machine:

```bash
npx wrangler secret put YOLO_API_URL
```

Paste one of these values:

```text
https://yolo.your-domain.com/detect-water-level
```

or:

```text
http://<VPS_IP>:8010/detect-water-level
```

Then set the same API key used by the VPS:

```bash
npx wrangler secret put YOLO_API_KEY
```

Redeploy if needed:

```bash
npm run deploy
```

## 6. Verify production

```bash
curl https://namtom-dash.kungmaxzaa.workers.dev/api/yolo/analyze
```

Expected:

```json
{"ok":true,"configured":true,"maxImages":8}
```

Then submit a report image from the user site. The dashboard should show YOLO depth, risk, confidence, and labels from the VPS service.
