# Plan 003 — HTTPS/SSL + Backend Deploy

**Finding:** The backend has no HTTPS, no domain, and no production deployment target. For Play Store, the backend MUST be accessible via HTTPS (Android blocks cleartext HTTP to non-local hosts by default). The `ALLOWED_ORIGIN` and `EXPO_PUBLIC_API_BASE_URL` fixes from Plan 001/002 must point to a real HTTPS URL.
**Category:** Security / Infrastructure
**Impact:** CRITICAL — blocks Play Store publishing, backend communication is plaintext
**Effort:** L (Large — requires server setup, DNS, SSL cert)
**Risk:** MEDIUM — production deployment is always risky
**Evidence:** `backend/README.md`, `docs/ROADMAP_PLAY_STORE.md`

---

## Prerequisites

Before starting, decide on a hosting provider:

| Provider | Cost | Ease | Notes |
|----------|------|------|-------|
| Railway | ~$5-10/mo | Easy | Good for Node.js, built-in SSL |
| Render | ~$7/mo | Easy | Good for Node.js + PostgreSQL |
| VPS (DigitalOcean) | ~$6/mo | Medium | Full control, needs manual setup |
| Fly.io | ~$5-10/mo | Medium | Good for Docker deployments |

**Recommended:** Railway or Render for simplicity. Both provide:
- Automatic HTTPS (Let's Encrypt)
- PostgreSQL add-on
- Node.js support
- Custom domain support

---

## Required Changes

### 1. Add `backend/Dockerfile` (optional, for containerized deployment)

```dockerfile
FROM node:20-slim

RUN npx playwright install chromium --with-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]
```

### 2. Create `backend/Procfile` (for Render/Railway)

```
web: node src/server.js
```

### 3. Add `backend/.env.production` file

```env
PORT=3001
NODE_ENV=production
BACKEND_API_TOKEN=<generate-a-strong-random-token>
DATABASE_URL=<production-postgresql-url>
ALLOWED_ORIGIN=https://pereira-te-escucha.com
PEREIRA_FORM_URL=https://doc.pereira.gov.co/ws/pqr/index.html
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=45000
WORKER_ENABLED=true
WORKER_POLL_MS=2500
```

### 4. Generate a production API token

```bash
# Generate a strong random token for BACKEND_API_TOKEN
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: a7f3c8e1b2d4f5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9
```

### 5. Update `App.tsx` production env (in EAS build)

The `EXPO_PUBLIC_API_BASE_URL` must point to the production HTTPS URL when building for production. Set in `eas.json`:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.pereira-te-escucha.com",
        "EXPO_PUBLIC_BACKEND_API_TOKEN": "a7f3c8e1b2d4..." 
      }
    }
  }
}
```

### 6. Update `backend/src/app.js` — trust proxy for HTTPS behind reverse proxy

Already configured: `app.set('trust proxy', 1)` — this is correct for Railway/Render.

### 7. Update `backend/src/config.js` — update production validation

This was already done in Plan 001. If not done yet, add:

```js
if (NODE_ENV === 'production') {
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*') {
    throw new Error('ALLOWED_ORIGIN debe ser un origen específico (no *) en producción.');
  }
}
```

---

## Deployment Steps (Railway)

### Step 1: Create Railway account
1. Go to https://railway.app/
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"

### Step 2: Set up PostgreSQL
1. In Railway dashboard, click "New" → "Database" → "Add PostgreSQL"
2. Copy the `DATABASE_URL` connection string

### Step 3: Configure environment variables

In Railway dashboard → your project → Variables:

```
BACKEND_API_TOKEN=a7f3c8e1b2d4...
NODE_ENV=production
ALLOWED_ORIGIN=https://pereira-te-escucha.com
PEREIRA_FORM_URL=https://doc.pereira.gov.co/ws/pqr/index.html
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=45000
WORKER_ENABLED=true
WORKER_POLL_MS=2500
```

### Step 4: Configure start command

In Railway dashboard → Settings → Deploy:
- Root Directory: `backend`
- Start Command: `node src/server.js`

### Step 5: Deploy
1. Railway auto-deploys when connected to GitHub
2. It will also auto-deploy on every push to default branch
3. Check logs in Railway dashboard

### Step 6: Set up custom domain (optional but recommended)
1. In Railway → Settings → Domains
2. Add `api.pereira-te-escucha.com`
3. Configure DNS at your domain registrar:
   - Add CNAME record: `api → your-project.railway.app`
4. Railway provisions SSL cert automatically

---

## Deployment Steps (Render — alternative)

### Step 1: Create Render account
1. Go to https://render.com/
2. Login with GitHub

### Step 2: New Web Service
1. "New +" → "Web Service"
2. Connect your GitHub repo
3. Name: `pereira-pqrs-backend`
4. Root Directory: `backend`
5. Runtime: `Node`
6. Build Command: `npm install && npx playwright install chromium --with-deps`
7. Start Command: `node src/server.js`
8. Select plan (Free tier available but spins down after inactivity)

### Step 3: Add PostgreSQL
1. "New +" → "PostgreSQL"
2. Copy the Internal Connection String
3. Add to environment variables as `DATABASE_URL`

### Step 4: Environment Variables
Same as Railway step 3.

### Step 5: Deploy
Render deploys automatically. Free tier spins down after 15 min idle — upgrade to Starter ($7/mo) for production.

---

## Verification Gates

```bash
# 1. Check deployment health
curl -s https://api.pereira-te-escucha.com/health
# Expected: {"ok":true,"service":"pereira-pqrs-backend"}

# 2. Check HTTPS
curl -sI https://api.pereira-te-escucha.com/health | grep -i "strict-transport-security"
# Expected: shows HSTS header (from Helmet)

# 3. Test submission endpoint
curl -s -X POST https://api.pereira-te-escucha.com/api/pqrs/submit-anonymous \
  -H "Authorization: Bearer $BACKEND_API_TOKEN" \
  -F "medioRespuesta=cartelera" \
  -F "tipoSolicitud=peticion" \
  -F "asunto=Testing deployment desde plan 003" \
  -F "descripcion=Verificacion de que el despliegue en produccion funciona correctamente." \
  -F "aceptarTratamiento=true"
# Expected: 202 Accepted (or 400 Validation error — either means it's alive)

# 4. Check CORS headers
curl -sI -H "Origin: https://pereira-te-escucha.com" \
  https://api.pereira-te-escucha.com/health | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: https://pereira-te-escucha.com

# 5. Verify SSL cert
echo | openssl s_client -connect api.pereira-te-escucha.com:443 2>/dev/null | openssl x509 -noout -dates
# Expected: shows certificate validity dates
```

---

## Files in Scope
- `backend/Dockerfile` — CREATE (optional)
- `backend/Procfile` — CREATE (optional)
- `backend/.env.production` — CREATE
- `eas.json` — UPDATE production profile with env vars

## Files Explicitly Out of Scope
- `App.tsx` (env vars already handled by Plan 002)
- `backend/src/server.js` (no code changes needed)
- `backend/src/app.js` (trust proxy already set)

---

## Security Checklist

- [ ] HTTPS enabled (auto by Railway/Render)
- [ ] `BACKEND_API_TOKEN` set to random 64-char hex string
- [ ] `ALLOWED_ORIGIN` set to specific domain
- [ ] `helmet()` CSP is configured (already in app.js)
- [ ] Rate limiting active (already in app.js)
- [ ] PostgreSQL password is strong
- [ ] HSTS header present (via Helmet)
- [ ] Backend logs are inspectable via deployment dashboard

---

## Costs Estimate (Monthly)

| Item | Cost |
|------|------|
| Railway/Render Node.js | $5-7 |
| PostgreSQL (Railway/Render) | $5-7 included or separate |
| Domain (namecheap, .com) | ~$10/year |
| Total | ~$10-15/month |

---

## STOP Conditions
- If the hosting provider's Node.js version is <20, STOP — Playwright requires Node 18+/20+
- If Playwright fails to launch in the server (missing system deps), STOP and check docs: `npx playwright install-deps chromium`
- If the deployment has no custom domain, the app will work but the `ALLOWED_ORIGIN` must use the Railway/Render provided URL (e.g., `https://pereira-pqrs-backend.railway.app`)
