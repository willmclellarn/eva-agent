/**
 * Configuration constants for Clawdbot Sandbox
 */

/** Port that the Clawdbot gateway listens on inside the container */
export const CLAWDBOT_PORT = 18789;

/** Maximum time to wait for Clawdbot to start (3 minutes) */
export const STARTUP_TIMEOUT_MS = 180_000;

/** Mount path for R2 persistent storage inside the container */
export const R2_MOUNT_PATH = '/data/clawdbot';

/** TTL for JWKS cache (1 hour) */
export const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
