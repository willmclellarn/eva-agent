/**
 * Clawdbot + Cloudflare Sandbox
 *
 * This Worker runs Clawdbot personal AI assistant in a Cloudflare Sandbox container.
 * It proxies all requests to the Clawdbot Gateway's web UI and WebSocket endpoint.
 *
 * Features:
 * - Web UI (Control Dashboard + WebChat) at /
 * - WebSocket support for real-time communication
 * - Admin UI at /_admin/ for device management
 * - Configuration via environment secrets
 *
 * Required secrets (set via `wrangler secret put`):
 * - ANTHROPIC_API_KEY: Your Anthropic API key
 *
 * Optional secrets:
 * - CLAWDBOT_GATEWAY_TOKEN: Token to protect gateway access
 * - TELEGRAM_BOT_TOKEN: Telegram bot token
 * - DISCORD_BOT_TOKEN: Discord bot token
 * - SLACK_BOT_TOKEN + SLACK_APP_TOKEN: Slack tokens
 */

import { Hono } from 'hono';
import { getSandbox, Sandbox } from '@cloudflare/sandbox';

import type { AppEnv } from './types';
import { CLAWDBOT_PORT } from './config';
import { createAccessMiddleware } from './auth';
import { ensureClawdbotGateway } from './gateway';
import { api, admin, debug } from './routes';

export { Sandbox };

// Main app
const app = new Hono<AppEnv>();

// Middleware: Initialize sandbox for all requests
app.use('*', async (c, next) => {
  const sandbox = getSandbox(c.env.Sandbox, 'clawdbot');
  c.set('sandbox', sandbox);
  await next();
});

// Health check endpoint (before starting clawdbot)
app.get('/sandbox-health', (c) => {
  return c.json({
    status: 'ok',
    service: 'clawdbot-sandbox',
    gateway_port: CLAWDBOT_PORT,
  });
});

// Mount API routes (protected by Cloudflare Access)
app.route('/api', api);

// Mount Admin UI routes (protected by Cloudflare Access)
app.route('/_admin', admin);

// Mount debug routes (protected by Cloudflare Access)
app.use('/debug/*', createAccessMiddleware({ type: 'json' }));
app.route('/debug', debug);

// All other routes: start clawdbot and proxy
app.all('*', async (c) => {
  const sandbox = c.get('sandbox');
  const request = c.req.raw;
  const url = new URL(request.url);

  // Ensure clawdbot is running (this will wait for startup)
  try {
    await ensureClawdbotGateway(sandbox, c.env);
  } catch (error) {
    console.error('Failed to start Clawdbot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let hint = 'Check worker logs with: wrangler tail';
    if (!c.env.ANTHROPIC_API_KEY) {
      hint = 'ANTHROPIC_API_KEY is not set. Run: wrangler secret put ANTHROPIC_API_KEY';
    } else if (errorMessage.includes('heap out of memory') || errorMessage.includes('OOM')) {
      hint = 'Gateway ran out of memory. Try again or check for memory leaks.';
    }

    return c.json({
      error: 'Clawdbot gateway failed to start',
      details: errorMessage,
      hint,
    }, 503);
  }

  // Proxy to Clawdbot
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    console.log('Proxying WebSocket connection to Clawdbot');
    console.log('WebSocket URL:', request.url);
    console.log('WebSocket search params:', url.search);
    return sandbox.wsConnect(request, CLAWDBOT_PORT);
  }

  console.log('Proxying HTTP request:', url.pathname + url.search);
  return sandbox.containerFetch(request, CLAWDBOT_PORT);
});

export default app;
