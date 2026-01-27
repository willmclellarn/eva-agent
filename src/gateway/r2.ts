import type { Sandbox } from '@cloudflare/sandbox';
import type { ClawdbotEnv } from '../types';
import { R2_MOUNT_PATH } from '../config';

/**
 * Mount R2 bucket for persistent storage
 * 
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @returns true if mounted successfully, false otherwise
 */
export async function mountR2Storage(sandbox: Sandbox, env: ClawdbotEnv): Promise<boolean> {
  // Skip if R2 credentials are not configured
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    console.log('R2 storage not configured (missing AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or CF_ACCOUNT_ID)');
    return false;
  }

  try {
    console.log('Mounting R2 bucket at', R2_MOUNT_PATH);
    await sandbox.mountBucket('clawdbot-data', R2_MOUNT_PATH, {
      endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    });
    console.log('R2 bucket mounted successfully - clawdbot data will persist across sessions');
    return true;
  } catch (err) {
    // Don't fail if mounting fails - clawdbot can still run without persistent storage
    console.error('Failed to mount R2 bucket:', err);
    return false;
  }
}
