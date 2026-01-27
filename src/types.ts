import type { Sandbox } from '@cloudflare/sandbox';

/**
 * Environment bindings for the Clawdbot Worker
 */
export interface ClawdbotEnv {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ASSETS: Fetcher; // Assets binding for admin UI static files
  CLAWDBOT_BUCKET: R2Bucket; // R2 bucket for persistent storage
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  CLAWDBOT_GATEWAY_TOKEN?: string;
  CLAWDBOT_DEV_MODE?: string;
  CLAWDBOT_BIND_MODE?: string;
  LOCAL_DEV?: string; // Set to 'true' to skip CF Access auth (for local development)
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DM_POLICY?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_DM_POLICY?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_APP_TOKEN?: string;
  // Cloudflare Access configuration for admin routes
  CF_ACCESS_TEAM_DOMAIN?: string; // e.g., 'myteam.cloudflareaccess.com'
  CF_ACCESS_AUD?: string; // Application Audience (AUD) tag
  // R2 credentials for bucket mounting (set via wrangler secret)
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  CF_ACCOUNT_ID?: string; // Cloudflare account ID for R2 endpoint
}

/**
 * Authenticated user from Cloudflare Access
 */
export interface AccessUser {
  email: string;
  name?: string;
}

/**
 * Hono app environment type
 */
export type AppEnv = {
  Bindings: ClawdbotEnv;
  Variables: {
    sandbox: Sandbox;
    accessUser?: AccessUser;
  };
};

/**
 * JWT payload from Cloudflare Access
 */
export interface JWTPayload {
  aud: string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  name?: string;
  sub: string;
  type: string;
}

/**
 * JSON Web Key
 */
export interface JWK extends JsonWebKey {
  kid?: string;
}

/**
 * JSON Web Key Set
 */
export interface JWKS {
  keys: JWK[];
}
