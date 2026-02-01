import type { Sandbox } from '@cloudflare/sandbox';
import type { OpenClawEnv } from '../types';
import { R2_MOUNT_PATH } from '../config';
import { mountR2Storage } from './r2';
import { waitForProcess } from './utils';

// Number of versioned backups to keep
const MAX_VERSIONED_BACKUPS = 5;

export interface SyncResult {
  success: boolean;
  lastSync?: string;
  error?: string;
  details?: string;
  skippedReason?: string;
}

export interface GoldenBackupResult {
  success: boolean;
  path?: string;
  timestamp?: string;
  error?: string;
}

/**
 * Check if the source data is healthy enough to backup.
 * This prevents overwriting good backups with fresh/empty container state.
 *
 * Requirements:
 * - openclaw.json must exist
 * - IDENTITY.md must exist and have meaningful content (not just whitespace/template)
 */
async function isSourceHealthy(sandbox: Sandbox): Promise<{ healthy: boolean; reason?: string }> {
  try {
    // Check openclaw.json exists (or old clawdbot.json for backward compatibility)
    const configCheck = await sandbox.startProcess('test -f /root/.openclaw/openclaw.json && echo "ok" || (test -f /root/.openclaw/clawdbot.json && echo "ok")');
    await waitForProcess(configCheck, 5000);
    const configLogs = await configCheck.getLogs();
    if (!configLogs.stdout?.includes('ok')) {
      return { healthy: false, reason: 'Missing openclaw.json' };
    }

    // Check IDENTITY.md exists and has meaningful content (more than just whitespace or template markers)
    // A healthy IDENTITY.md should have actual personality content, not just empty/template state
    const identityCheck = await sandbox.startProcess(`
      if [ ! -f /root/.openclaw/workspace/skills/IDENTITY.md ]; then
        echo "missing"
      elif [ ! -s /root/.openclaw/workspace/skills/IDENTITY.md ]; then
        echo "empty"
      elif grep -q "^# " /root/.openclaw/workspace/skills/IDENTITY.md && [ $(wc -c < /root/.openclaw/workspace/skills/IDENTITY.md) -gt 100 ]; then
        echo "healthy"
      else
        echo "minimal"
      fi
    `);
    await waitForProcess(identityCheck, 5000);
    const identityLogs = await identityCheck.getLogs();
    const identityStatus = identityLogs.stdout?.trim();

    if (identityStatus === 'missing') {
      return { healthy: false, reason: 'IDENTITY.md does not exist - appears to be fresh container' };
    }
    if (identityStatus === 'empty') {
      return { healthy: false, reason: 'IDENTITY.md is empty - appears to be fresh container' };
    }
    if (identityStatus === 'minimal') {
      return { healthy: false, reason: 'IDENTITY.md has minimal content - may be fresh/template state' };
    }

    return { healthy: true };
  } catch (err) {
    return { healthy: false, reason: `Health check error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

/**
 * Create a versioned backup of current R2 data before overwriting.
 * Keeps the last N backups and removes older ones.
 * Supports both old (clawdbot) and new (openclaw) backup formats.
 */
async function createVersionedBackup(sandbox: Sandbox): Promise<{ success: boolean; path?: string; error?: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${R2_MOUNT_PATH}/backups/${timestamp}`;

  try {
    // Create backup directory and copy current data if it exists
    // Check for both new (openclaw) and old (clawdbot) formats
    const backupCmd = `
      # Only backup if there's existing data to backup
      if [ -d "${R2_MOUNT_PATH}/openclaw" ] && [ -f "${R2_MOUNT_PATH}/openclaw/openclaw.json" ]; then
        mkdir -p "${backupPath}"
        cp -r "${R2_MOUNT_PATH}/openclaw" "${backupPath}/" 2>/dev/null || true
        cp -r "${R2_MOUNT_PATH}/skills" "${backupPath}/" 2>/dev/null || true
        cp "${R2_MOUNT_PATH}/.last-sync" "${backupPath}/" 2>/dev/null || true
        echo "backed_up"
      elif [ -d "${R2_MOUNT_PATH}/clawdbot" ] && [ -f "${R2_MOUNT_PATH}/clawdbot/clawdbot.json" ]; then
        mkdir -p "${backupPath}"
        cp -r "${R2_MOUNT_PATH}/clawdbot" "${backupPath}/" 2>/dev/null || true
        cp -r "${R2_MOUNT_PATH}/skills" "${backupPath}/" 2>/dev/null || true
        cp "${R2_MOUNT_PATH}/.last-sync" "${backupPath}/" 2>/dev/null || true
        echo "backed_up"
      else
        echo "no_existing_data"
      fi
    `;

    const proc = await sandbox.startProcess(backupCmd);
    await waitForProcess(proc, 30000);
    const logs = await proc.getLogs();

    if (logs.stdout?.includes('no_existing_data')) {
      return { success: true, path: undefined }; // No existing data to backup, that's OK
    }

    if (!logs.stdout?.includes('backed_up')) {
      return { success: false, error: logs.stderr || 'Backup command did not complete' };
    }

    // Clean up old backups, keeping only the last N
    const cleanupCmd = `
      cd "${R2_MOUNT_PATH}/backups" 2>/dev/null && \
      ls -t | tail -n +${MAX_VERSIONED_BACKUPS + 1} | xargs -r rm -rf
    `;
    const cleanupProc = await sandbox.startProcess(cleanupCmd);
    await waitForProcess(cleanupProc, 10000);

    return { success: true, path: backupPath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Sync openclaw config from container to R2 for persistence.
 *
 * This function:
 * 1. Mounts R2 if not already mounted
 * 2. Verifies source data is healthy (not fresh/empty container)
 * 3. Creates versioned backup of existing R2 data
 * 4. Runs rsync to copy config to R2
 * 5. Writes a timestamp file for tracking
 *
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @returns SyncResult with success status and optional error details
 */
export async function syncToR2(sandbox: Sandbox, env: OpenClawEnv): Promise<SyncResult> {
  // Check if R2 is configured
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return { success: false, error: 'R2 storage is not configured' };
  }

  // Mount R2 if not already mounted
  const mounted = await mountR2Storage(sandbox, env);
  if (!mounted) {
    return { success: false, error: 'Failed to mount R2 storage' };
  }

  // Health check: verify source has meaningful data before syncing
  // This prevents accidentally overwriting a good backup with empty/fresh container state
  const healthCheck = await isSourceHealthy(sandbox);
  if (!healthCheck.healthy) {
    return {
      success: false,
      error: 'Sync skipped: source data is not healthy',
      skippedReason: healthCheck.reason,
      details: 'The local data appears to be a fresh/empty container. Refusing to overwrite potentially good R2 backup.',
    };
  }

  // Create versioned backup before overwriting
  const backupResult = await createVersionedBackup(sandbox);
  if (!backupResult.success) {
    console.warn('[sync] Failed to create versioned backup:', backupResult.error);
    // Continue anyway - we don't want to block sync entirely if backup fails
  } else if (backupResult.path) {
    console.log('[sync] Created versioned backup at:', backupResult.path);
  }

  // Run rsync to backup config to R2 (using new openclaw paths)
  // Note: Use --no-times because s3fs doesn't support setting timestamps
  const syncCmd = `rsync -r --no-times --delete --exclude='*.lock' --exclude='*.log' --exclude='*.tmp' /root/.openclaw/ ${R2_MOUNT_PATH}/openclaw/ && rsync -r --no-times --delete /root/.openclaw/workspace/skills/ ${R2_MOUNT_PATH}/skills/ && date -Iseconds > ${R2_MOUNT_PATH}/.last-sync`;

  try {
    const proc = await sandbox.startProcess(syncCmd);
    await waitForProcess(proc, 30000); // 30 second timeout for sync

    // Check for success by reading the timestamp file
    // (process status may not update reliably in sandbox API)
    const timestampProc = await sandbox.startProcess(`cat ${R2_MOUNT_PATH}/.last-sync`);
    await waitForProcess(timestampProc, 5000);
    const timestampLogs = await timestampProc.getLogs();
    const lastSync = timestampLogs.stdout?.trim();

    if (lastSync && lastSync.match(/^\d{4}-\d{2}-\d{2}/)) {
      return { success: true, lastSync };
    } else {
      const logs = await proc.getLogs();
      return {
        success: false,
        error: 'Sync failed',
        details: logs.stderr || logs.stdout || 'No timestamp file created',
      };
    }
  } catch (err) {
    return {
      success: false,
      error: 'Sync error',
      details: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Create a "golden backup" - a protected snapshot that won't be auto-overwritten.
 * These are stored in /golden-backup/ and must be created manually via admin UI.
 *
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @returns GoldenBackupResult with success status and path
 */
export async function createGoldenBackup(sandbox: Sandbox, env: OpenClawEnv): Promise<GoldenBackupResult> {
  // Check if R2 is configured
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return { success: false, error: 'R2 storage is not configured' };
  }

  // Mount R2 if not already mounted
  const mounted = await mountR2Storage(sandbox, env);
  if (!mounted) {
    return { success: false, error: 'Failed to mount R2 storage' };
  }

  // Verify source data is healthy
  const healthCheck = await isSourceHealthy(sandbox);
  if (!healthCheck.healthy) {
    return { success: false, error: `Cannot create golden backup: ${healthCheck.reason}` };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const goldenPath = `${R2_MOUNT_PATH}/golden-backup/${timestamp}`;

  try {
    const backupCmd = `
      mkdir -p "${goldenPath}"
      cp -r /root/.openclaw/* "${goldenPath}/" 2>/dev/null || true
      mkdir -p "${goldenPath}/skills"
      cp -r /root/.openclaw/workspace/skills/* "${goldenPath}/skills/" 2>/dev/null || true
      date -Iseconds > "${goldenPath}/.created"
      echo "golden_created"
    `;

    const proc = await sandbox.startProcess(backupCmd);
    await waitForProcess(proc, 30000);
    const logs = await proc.getLogs();

    if (logs.stdout?.includes('golden_created')) {
      return { success: true, path: goldenPath, timestamp };
    } else {
      return { success: false, error: logs.stderr || 'Golden backup command did not complete' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * List available backups (versioned and golden).
 *
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @returns List of backup paths with timestamps
 */
export async function listBackups(sandbox: Sandbox, env: OpenClawEnv): Promise<{
  versioned: string[];
  golden: string[];
  error?: string;
}> {
  // Check if R2 is configured
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return { versioned: [], golden: [], error: 'R2 storage is not configured' };
  }

  // Mount R2 if not already mounted
  const mounted = await mountR2Storage(sandbox, env);
  if (!mounted) {
    return { versioned: [], golden: [], error: 'Failed to mount R2 storage' };
  }

  try {
    const listCmd = `
      echo "VERSIONED:"
      ls -1 "${R2_MOUNT_PATH}/backups" 2>/dev/null || echo ""
      echo "GOLDEN:"
      ls -1 "${R2_MOUNT_PATH}/golden-backup" 2>/dev/null || echo ""
    `;

    const proc = await sandbox.startProcess(listCmd);
    await waitForProcess(proc, 10000);
    const logs = await proc.getLogs();
    const output = logs.stdout || '';

    const versionedMatch = output.match(/VERSIONED:\n([\s\S]*?)GOLDEN:/);
    const goldenMatch = output.match(/GOLDEN:\n([\s\S]*?)$/);

    const versioned = (versionedMatch?.[1] || '').trim().split('\n').filter(Boolean);
    const golden = (goldenMatch?.[1] || '').trim().split('\n').filter(Boolean);

    return { versioned, golden };
  } catch (err) {
    return { versioned: [], golden: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Restore from a specific backup (versioned or golden).
 * Supports both old (clawdbot) and new (openclaw) backup formats.
 *
 * @param sandbox - The sandbox instance
 * @param env - Worker environment bindings
 * @param backupType - 'versioned' or 'golden'
 * @param backupName - The backup directory name (timestamp)
 * @returns SyncResult
 */
export async function restoreFromBackup(
  sandbox: Sandbox,
  env: OpenClawEnv,
  backupType: 'versioned' | 'golden',
  backupName: string
): Promise<SyncResult> {
  // Check if R2 is configured
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return { success: false, error: 'R2 storage is not configured' };
  }

  // Mount R2 if not already mounted
  const mounted = await mountR2Storage(sandbox, env);
  if (!mounted) {
    return { success: false, error: 'Failed to mount R2 storage' };
  }

  // Sanitize backup name to prevent path traversal
  const safeName = backupName.replace(/[^a-zA-Z0-9_-]/g, '');
  const backupDir = backupType === 'golden' ? 'golden-backup' : 'backups';
  const backupPath = `${R2_MOUNT_PATH}/${backupDir}/${safeName}`;

  try {
    // Verify backup exists
    const verifyCmd = `test -d "${backupPath}" && echo "exists"`;
    const verifyProc = await sandbox.startProcess(verifyCmd);
    await waitForProcess(verifyProc, 5000);
    const verifyLogs = await verifyProc.getLogs();

    if (!verifyLogs.stdout?.includes('exists')) {
      return { success: false, error: `Backup not found: ${backupPath}` };
    }

    // Restore to container - handle both old (clawdbot) and new (openclaw) backup formats
    const restoreCmd = `
      # Restore openclaw config (new format)
      if [ -d "${backupPath}/openclaw" ]; then
        cp -r "${backupPath}/openclaw/"* /root/.openclaw/
      # Restore clawdbot config (old format) and migrate
      elif [ -d "${backupPath}/clawdbot" ]; then
        cp -r "${backupPath}/clawdbot/"* /root/.openclaw/
        # Rename clawdbot.json to openclaw.json if needed
        if [ -f /root/.openclaw/clawdbot.json ] && [ ! -f /root/.openclaw/openclaw.json ]; then
          mv /root/.openclaw/clawdbot.json /root/.openclaw/openclaw.json
        fi
      elif [ -f "${backupPath}/openclaw.json" ]; then
        cp -r "${backupPath}/"* /root/.openclaw/
      elif [ -f "${backupPath}/clawdbot.json" ]; then
        cp -r "${backupPath}/"* /root/.openclaw/
        if [ -f /root/.openclaw/clawdbot.json ] && [ ! -f /root/.openclaw/openclaw.json ]; then
          mv /root/.openclaw/clawdbot.json /root/.openclaw/openclaw.json
        fi
      fi

      # Restore skills
      if [ -d "${backupPath}/skills" ]; then
        mkdir -p /root/.openclaw/workspace/skills
        cp -r "${backupPath}/skills/"* /root/.openclaw/workspace/skills/
      fi

      echo "restored"
    `;

    const restoreProc = await sandbox.startProcess(restoreCmd);
    await waitForProcess(restoreProc, 30000);
    const restoreLogs = await restoreProc.getLogs();

    if (restoreLogs.stdout?.includes('restored')) {
      return { success: true, details: `Restored from ${backupType} backup: ${safeName}` };
    } else {
      return { success: false, error: 'Restore command did not complete', details: restoreLogs.stderr };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
