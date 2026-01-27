import type { ClawdbotEnv } from '../types';
import { R2_MOUNT_PATH } from '../config';

/**
 * Build environment variables to pass to the Clawdbot container process
 * 
 * @param env - Worker environment bindings
 * @param r2Mounted - Whether R2 storage was successfully mounted
 * @returns Environment variables record
 */
export function buildEnvVars(env: ClawdbotEnv, r2Mounted: boolean): Record<string, string> {
  const envVars: Record<string, string> = {};

  if (env.ANTHROPIC_API_KEY) envVars.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.OPENAI_API_KEY) envVars.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.CLAWDBOT_GATEWAY_TOKEN) envVars.CLAWDBOT_GATEWAY_TOKEN = env.CLAWDBOT_GATEWAY_TOKEN;
  if (env.CLAWDBOT_DEV_MODE) envVars.CLAWDBOT_DEV_MODE = env.CLAWDBOT_DEV_MODE;
  if (env.CLAWDBOT_BIND_MODE) envVars.CLAWDBOT_BIND_MODE = env.CLAWDBOT_BIND_MODE;
  if (env.TELEGRAM_BOT_TOKEN) envVars.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  if (env.TELEGRAM_DM_POLICY) envVars.TELEGRAM_DM_POLICY = env.TELEGRAM_DM_POLICY;
  if (env.DISCORD_BOT_TOKEN) envVars.DISCORD_BOT_TOKEN = env.DISCORD_BOT_TOKEN;
  if (env.DISCORD_DM_POLICY) envVars.DISCORD_DM_POLICY = env.DISCORD_DM_POLICY;
  if (env.SLACK_BOT_TOKEN) envVars.SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN;
  if (env.SLACK_APP_TOKEN) envVars.SLACK_APP_TOKEN = env.SLACK_APP_TOKEN;

  // If R2 is mounted, tell clawdbot to use it for state/config
  if (r2Mounted) {
    envVars.CLAWDBOT_STATE_DIR = R2_MOUNT_PATH;
    envVars.CLAWDBOT_CONFIG_PATH = `${R2_MOUNT_PATH}/clawdbot.json`;
  }

  return envVars;
}
