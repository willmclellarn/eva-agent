import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncToR2 } from './sync';
import {
  createMockEnv,
  createMockEnvWithR2,
  createMockProcess,
  createMockSandbox,
  suppressConsole
} from '../test-utils';

describe('syncToR2', () => {
  beforeEach(() => {
    suppressConsole();
  });

  describe('configuration checks', () => {
    it('returns error when R2 is not configured', async () => {
      const { sandbox } = createMockSandbox();
      const env = createMockEnv();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('R2 storage is not configured');
    });

    it('returns error when mount fails', async () => {
      const { sandbox, startProcessMock, mountBucketMock } = createMockSandbox();
      startProcessMock.mockResolvedValue(createMockProcess(''));
      mountBucketMock.mockRejectedValue(new Error('Mount failed'));

      const env = createMockEnvWithR2();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to mount R2 storage');
    });
  });

  describe('health checks', () => {
    it('returns error when source is missing openclaw.json', async () => {
      const { sandbox, startProcessMock } = createMockSandbox();
      // Calls: mount check, config check (no openclaw.json)
      startProcessMock
        .mockResolvedValueOnce(createMockProcess('s3fs on /data/openclaw type fuse.s3fs\n'))
        .mockResolvedValueOnce(createMockProcess('')); // No "ok" - missing config

      const env = createMockEnvWithR2();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync skipped: source data is not healthy');
      expect(result.skippedReason).toBe('Missing openclaw.json');
    });

    it('returns error when IDENTITY.md is missing', async () => {
      const { sandbox, startProcessMock } = createMockSandbox();
      // Calls: mount check, config check (ok), identity check (missing)
      startProcessMock
        .mockResolvedValueOnce(createMockProcess('s3fs on /data/openclaw type fuse.s3fs\n'))
        .mockResolvedValueOnce(createMockProcess('ok'))
        .mockResolvedValueOnce(createMockProcess('missing'));

      const env = createMockEnvWithR2();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync skipped: source data is not healthy');
      expect(result.skippedReason).toContain('IDENTITY.md does not exist');
    });
  });

  describe('sync execution', () => {
    it('returns success when sync completes', async () => {
      const { sandbox, startProcessMock } = createMockSandbox();
      const timestamp = '2026-01-27T12:00:00+00:00';

      // Calls: mount check, config check, identity check, versioned backup, rsync, cat timestamp
      startProcessMock
        .mockResolvedValueOnce(createMockProcess('s3fs on /data/openclaw type fuse.s3fs\n'))
        .mockResolvedValueOnce(createMockProcess('ok'))
        .mockResolvedValueOnce(createMockProcess('healthy'))
        .mockResolvedValueOnce(createMockProcess('no_existing_data'))
        .mockResolvedValueOnce(createMockProcess(''))
        .mockResolvedValueOnce(createMockProcess(timestamp));

      const env = createMockEnvWithR2();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(true);
      expect(result.lastSync).toBe(timestamp);
    });

    it('returns error when rsync fails (no timestamp created)', async () => {
      const { sandbox, startProcessMock } = createMockSandbox();

      // Calls: mount check, config check, identity check, versioned backup, rsync (fails), cat timestamp (empty)
      startProcessMock
        .mockResolvedValueOnce(createMockProcess('s3fs on /data/openclaw type fuse.s3fs\n'))
        .mockResolvedValueOnce(createMockProcess('ok'))
        .mockResolvedValueOnce(createMockProcess('healthy'))
        .mockResolvedValueOnce(createMockProcess('no_existing_data'))
        .mockResolvedValueOnce(createMockProcess('', { exitCode: 1 }))
        .mockResolvedValueOnce(createMockProcess(''));

      const env = createMockEnvWithR2();

      const result = await syncToR2(sandbox, env);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync failed');
    });

    it('verifies rsync command is called with correct flags', async () => {
      const { sandbox, startProcessMock } = createMockSandbox();
      const timestamp = '2026-01-27T12:00:00+00:00';

      // Calls: mount check, config check, identity check, versioned backup, rsync, cat timestamp
      startProcessMock
        .mockResolvedValueOnce(createMockProcess('s3fs on /data/openclaw type fuse.s3fs\n'))
        .mockResolvedValueOnce(createMockProcess('ok'))
        .mockResolvedValueOnce(createMockProcess('healthy'))
        .mockResolvedValueOnce(createMockProcess('no_existing_data'))
        .mockResolvedValueOnce(createMockProcess(''))
        .mockResolvedValueOnce(createMockProcess(timestamp));

      const env = createMockEnvWithR2();

      await syncToR2(sandbox, env);

      // Fifth call should be rsync (after mount, config, identity, backup)
      const rsyncCall = startProcessMock.mock.calls[4][0];
      expect(rsyncCall).toContain('rsync');
      expect(rsyncCall).toContain('--no-times');
      expect(rsyncCall).toContain('--delete');
      expect(rsyncCall).toContain('/root/.openclaw/');
      expect(rsyncCall).toContain('/data/openclaw/');
    });
  });
});
