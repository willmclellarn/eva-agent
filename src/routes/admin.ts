import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createAccessMiddleware } from '../auth';

/**
 * Admin UI routes
 * Serves static files from the ASSETS binding, protected by Cloudflare Access
 */
const admin = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for admin UI (redirect if missing)
admin.use('*', createAccessMiddleware({ type: 'html', redirectOnMissing: true }));

// Serve admin UI static files via ASSETS binding
// Assets are built to dist/client with base "/_admin/"
// The built assets are at /assets/* in the dist folder, so we need to rewrite the path
admin.get('/assets/*', async (c) => {
  const url = new URL(c.req.url);
  // Rewrite /_admin/assets/* to /assets/* for the ASSETS binding
  const assetPath = url.pathname.replace('/_admin/assets/', '/assets/');
  const assetUrl = new URL(assetPath, url.origin);
  return c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw));
});

// Serve index.html for all other admin routes (SPA)
admin.get('*', async (c) => {
  const url = new URL(c.req.url);
  return c.env.ASSETS.fetch(new Request(new URL('/index.html', url.origin).toString()));
});

export { admin };
