# EvaAgent Deployment Guide - January 30, 2026

This guide documents the complete deployment of OpenClaw (EvaAgent) to Cloudflare Workers with Sandbox containers.

## Final Result

- **URL**: `https://moltbot-sandbox.w-6b6.workers.dev`
- **Gateway Token**: `24d9ef1bdb5c23121f4c18c2fe86ef78a3d894a7db988239c3823b1dd61bf69f`
- **Access URL**: `https://moltbot-sandbox.w-6b6.workers.dev/?token=24d9ef1bdb5c23121f4c18c2fe86ef78a3d894a7db988239c3823b1dd61bf69f`
- **Admin UI**: `https://moltbot-sandbox.w-6b6.workers.dev/_admin/`
- **Model**: Claude Opus 4.5

---

## Prerequisites Enabled in Cloudflare Dashboard

Before deployment, these features had to be manually enabled:

1. **Workers Paid Plan** - Required for Sandbox containers ($5/month)
2. **R2 Storage** - Go to R2 in dashboard, accept terms
3. **Workers.dev Subdomain** - Go to Workers & Pages > Your subdomain
4. **Containers** - Go to Workers > Containers, enable the feature

---

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
cd /Users/willmclellarn/0-Internal/evaagent
npm install
```

### 2. Set Required Secrets

```bash
# Anthropic API Key
npx wrangler secret put ANTHROPIC_API_KEY
# Enter: sk-ant-api03-... (your key)

# Generate and set gateway token
export MOLTBOT_GATEWAY_TOKEN=$(openssl rand -hex 32)
echo "Your gateway token: $MOLTBOT_GATEWAY_TOKEN"
echo "$MOLTBOT_GATEWAY_TOKEN" | npx wrangler secret put MOLTBOT_GATEWAY_TOKEN
```

### 3. Deploy

```bash
npm run deploy
```

First deployment takes 1-2 minutes for container cold start.

---

## Cloudflare Access Setup (Required for Admin UI)

### 1. Enable Access on workers.dev

1. Go to [Workers & Pages Dashboard](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. Select your Worker (`moltbot-sandbox`)
3. In **Settings** > **Domains & Routes**, find the `workers.dev` row
4. Click the meatballs menu (`...`) > **Enable Cloudflare Access**
5. Click **Manage Cloudflare Access** to configure allowed emails

### 2. Get the Application Audience (AUD)

1. In Zero Trust Dashboard, go to **Access** > **Applications**
2. Find your application (e.g., `moltbot-sandbox - Production`)
3. Click to open settings
4. Copy the **Application Audience (AUD)** tag

### 3. Set Access Secrets

```bash
# Team domain (e.g., "gendev.cloudflareaccess.com")
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN

# Application Audience tag from step 2
npx wrangler secret put CF_ACCESS_AUD
```

### 4. Redeploy

```bash
npm run deploy
```

---

## Device Pairing

After deployment, the chat UI shows "disconnected - Pairing required". This is normal.

### To pair your device:

1. Go to `/_admin/` (requires Cloudflare Access login)
2. Under **Pending Pairing Requests**, you'll see your device
3. Click **Approve** to pair it
4. Return to the main chat UI - it should now show "Health OK"

Each new browser/device needs to be approved via the admin UI.

---

## Troubleshooting

### "Unauthorized - Access session invalid or expired"

The AUD tag might be wrong. To fix:

1. Go to Zero Trust > Access > Applications
2. Find your app and copy the exact AUD tag
3. Update the secret:
   ```bash
   echo "YOUR_CORRECT_AUD" | npx wrangler secret put CF_ACCESS_AUD
   ```
4. Redeploy: `npm run deploy`

### "Configuration Required" on admin page

Missing CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD secrets. Set them as shown above.

### Container won't start / "Unauthorized" during push

Containers feature not enabled. Go to Workers > Containers in dashboard and enable it.

### R2 bucket errors (code 10042)

R2 not enabled. Go to R2 in dashboard and accept terms.

---

## Optional: R2 Persistent Storage

Without R2, paired devices and conversations are lost on container restart.

### 1. Create R2 API Token

1. Go to **R2** > **Overview** > **Manage R2 API Tokens**
2. Create token with **Object Read & Write** permissions
3. Select `moltbot-data` bucket
4. Copy Access Key ID and Secret Access Key

### 2. Set R2 Secrets

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put CF_ACCOUNT_ID
```

Account ID: Found in dashboard URL or click three dots next to account name > Copy Account ID

---

## All Secrets Reference

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `MOLTBOT_GATEWAY_TOKEN` | Yes | Token for accessing Control UI |
| `CF_ACCESS_TEAM_DOMAIN` | Yes | e.g., `gendev.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Yes | Application Audience tag from Access app |
| `R2_ACCESS_KEY_ID` | No | For persistent storage |
| `R2_SECRET_ACCESS_KEY` | No | For persistent storage |
| `CF_ACCOUNT_ID` | No | For R2 storage |

---

## Local Development

Create `.dev.vars` file:

```bash
ANTHROPIC_API_KEY=your-key-here
DEV_MODE=true
DEBUG_ROUTES=true
MOLTBOT_GATEWAY_TOKEN=dev-token-change-in-prod
```

Run locally:

```bash
npm run dev
```

Note: WebSocket connections may not work fully in local dev. Deploy to Cloudflare for full functionality.

---

## Architecture

```
User Browser
     │
     ▼
Cloudflare Workers (Hono app)
     │
     ├── Static Assets (Vite-built React UI)
     ├── Auth Middleware (Cloudflare Access JWT)
     ├── Admin API (/api/*)
     └── WebSocket Proxy
           │
           ▼
     Sandbox Container
           │
           └── OpenClaw Gateway (port 18789)
                 │
                 └── Claude API (Opus 4.5)
```

---

## Model Configuration

Default: **Claude Opus 4.5** (`anthropic/claude-opus-4-5`)

To use AI Gateway or different models, set:
- `AI_GATEWAY_BASE_URL` - Routes through Cloudflare AI Gateway
- `AI_GATEWAY_API_KEY` - API key for the gateway

See main README.md for full AI Gateway setup instructions.
