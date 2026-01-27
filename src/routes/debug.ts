import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { findExistingClawdbotProcess } from '../gateway';

/**
 * Debug routes for inspecting container state
 * Note: These routes should be protected by Cloudflare Access middleware
 * when mounted in the main app
 */
const debug = new Hono<AppEnv>();

// GET /debug/version - Returns build info from inside the container
debug.get('/version', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    // Read the build info file
    const buildProcess = await sandbox.startProcess('cat /root/.clawdbot/build-info.json');
    await new Promise(resolve => setTimeout(resolve, 500));
    const buildLogs = await buildProcess.getLogs();

    let buildInfo = null;
    try {
      buildInfo = JSON.parse(buildLogs.stdout || '{}');
    } catch {
      // File might not exist in older deployments
    }

    // Also get clawdbot version
    const versionProcess = await sandbox.startProcess('clawdbot --version');
    await new Promise(resolve => setTimeout(resolve, 500));
    const versionLogs = await versionProcess.getLogs();
    const clawdbotVersion = (versionLogs.stdout || versionLogs.stderr || '').trim();

    return c.json({
      container: buildInfo || { error: 'build-info.json not found (older deployment?)' },
      clawdbot_version: clawdbotVersion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ status: 'error', message: `Failed to get version info: ${errorMessage}` }, 500);
  }
});

// GET /debug/processes - List all processes with optional logs
debug.get('/processes', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processes = await sandbox.listProcesses();
    const includeLogs = c.req.query('logs') === 'true';

    const processData = await Promise.all(processes.map(async p => {
      const data: Record<string, unknown> = {
        id: p.id,
        command: p.command,
        status: p.status,
        startTime: p.startTime?.toISOString(),
        endTime: p.endTime?.toISOString(),
        exitCode: p.exitCode,
      };

      if (includeLogs) {
        try {
          const logs = await p.getLogs();
          data.stdout = logs.stdout || '';
          data.stderr = logs.stderr || '';
        } catch {
          data.logs_error = 'Failed to retrieve logs';
        }
      }

      return data;
    }));

    // Sort by status (running first, then starting, completed, failed)
    // Within each status, sort by startTime descending (newest first)
    const statusOrder: Record<string, number> = {
      'running': 0,
      'starting': 1,
      'completed': 2,
      'failed': 3,
    };
    
    processData.sort((a, b) => {
      const statusA = statusOrder[a.status as string] ?? 99;
      const statusB = statusOrder[b.status as string] ?? 99;
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // Within same status, sort by startTime descending
      const timeA = a.startTime as string || '';
      const timeB = b.startTime as string || '';
      return timeB.localeCompare(timeA);
    });

    return c.json({ count: processes.length, processes: processData });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// GET /debug/logs - Returns container logs for debugging
debug.get('/logs', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processId = c.req.query('id');
    let process = null;

    if (processId) {
      const processes = await sandbox.listProcesses();
      process = processes.find(p => p.id === processId);
      if (!process) {
        return c.json({
          status: 'not_found',
          message: `Process ${processId} not found`,
          stdout: '',
          stderr: '',
        }, 404);
      }
    } else {
      process = await findExistingClawdbotProcess(sandbox);
      if (!process) {
        return c.json({
          status: 'no_process',
          message: 'No Clawdbot process is currently running',
          stdout: '',
          stderr: '',
        });
      }
    }

    const logs = await process.getLogs();
    return c.json({
      status: 'ok',
      process_id: process.id,
      process_status: process.status,
      stdout: logs.stdout || '',
      stderr: logs.stderr || '',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({
      status: 'error',
      message: `Failed to get logs: ${errorMessage}`,
      stdout: '',
      stderr: '',
    }, 500);
  }
});

export { debug };
