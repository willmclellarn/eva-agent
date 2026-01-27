import { describe, it, expect } from 'vitest';
import { buildEnvVars } from './env';
import type { ClawdbotEnv } from '../types';

// Helper to create a minimal env object
function createEnv(overrides: Partial<ClawdbotEnv> = {}): ClawdbotEnv {
  return {
    Sandbox: {} as any,
    ASSETS: {} as any,
    CLAWDBOT_BUCKET: {} as any,
    ...overrides,
  };
}

describe('buildEnvVars', () => {
  it('returns empty object when no env vars set', () => {
    const env = createEnv();
    const result = buildEnvVars(env, false);
    expect(result).toEqual({});
  });

  it('includes ANTHROPIC_API_KEY when set', () => {
    const env = createEnv({ ANTHROPIC_API_KEY: 'sk-test-key' });
    const result = buildEnvVars(env, false);
    expect(result.ANTHROPIC_API_KEY).toBe('sk-test-key');
  });

  it('includes OPENAI_API_KEY when set', () => {
    const env = createEnv({ OPENAI_API_KEY: 'sk-openai-key' });
    const result = buildEnvVars(env, false);
    expect(result.OPENAI_API_KEY).toBe('sk-openai-key');
  });

  it('includes CLAWDBOT_GATEWAY_TOKEN when set', () => {
    const env = createEnv({ CLAWDBOT_GATEWAY_TOKEN: 'my-token' });
    const result = buildEnvVars(env, false);
    expect(result.CLAWDBOT_GATEWAY_TOKEN).toBe('my-token');
  });

  it('includes all channel tokens when set', () => {
    const env = createEnv({
      TELEGRAM_BOT_TOKEN: 'tg-token',
      TELEGRAM_DM_POLICY: 'pairing',
      DISCORD_BOT_TOKEN: 'discord-token',
      DISCORD_DM_POLICY: 'open',
      SLACK_BOT_TOKEN: 'slack-bot',
      SLACK_APP_TOKEN: 'slack-app',
    });
    const result = buildEnvVars(env, false);
    
    expect(result.TELEGRAM_BOT_TOKEN).toBe('tg-token');
    expect(result.TELEGRAM_DM_POLICY).toBe('pairing');
    expect(result.DISCORD_BOT_TOKEN).toBe('discord-token');
    expect(result.DISCORD_DM_POLICY).toBe('open');
    expect(result.SLACK_BOT_TOKEN).toBe('slack-bot');
    expect(result.SLACK_APP_TOKEN).toBe('slack-app');
  });

  it('sets R2 paths when r2Mounted is true', () => {
    const env = createEnv();
    const result = buildEnvVars(env, true);
    
    expect(result.CLAWDBOT_STATE_DIR).toBe('/data/clawdbot');
    expect(result.CLAWDBOT_CONFIG_PATH).toBe('/data/clawdbot/clawdbot.json');
  });

  it('does not set R2 paths when r2Mounted is false', () => {
    const env = createEnv();
    const result = buildEnvVars(env, false);
    
    expect(result.CLAWDBOT_STATE_DIR).toBeUndefined();
    expect(result.CLAWDBOT_CONFIG_PATH).toBeUndefined();
  });

  it('includes dev mode and bind mode when set', () => {
    const env = createEnv({
      CLAWDBOT_DEV_MODE: 'true',
      CLAWDBOT_BIND_MODE: 'lan',
    });
    const result = buildEnvVars(env, false);
    
    expect(result.CLAWDBOT_DEV_MODE).toBe('true');
    expect(result.CLAWDBOT_BIND_MODE).toBe('lan');
  });

  it('combines all env vars correctly', () => {
    const env = createEnv({
      ANTHROPIC_API_KEY: 'sk-key',
      CLAWDBOT_GATEWAY_TOKEN: 'token',
      TELEGRAM_BOT_TOKEN: 'tg',
    });
    const result = buildEnvVars(env, true);
    
    expect(result).toEqual({
      ANTHROPIC_API_KEY: 'sk-key',
      CLAWDBOT_GATEWAY_TOKEN: 'token',
      TELEGRAM_BOT_TOKEN: 'tg',
      CLAWDBOT_STATE_DIR: '/data/clawdbot',
      CLAWDBOT_CONFIG_PATH: '/data/clawdbot/clawdbot.json',
    });
  });
});
