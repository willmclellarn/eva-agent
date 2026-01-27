import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createAccessMiddleware } from '../auth';
import { ensureClawdbotGateway, findExistingClawdbotProcess } from '../gateway';

/**
 * API routes for device management and gateway control
 * All routes are protected by Cloudflare Access
 */
const api = new Hono<AppEnv>();

// Middleware: Verify Cloudflare Access JWT for all API routes
api.use('*', createAccessMiddleware({ type: 'json' }));

// GET /api/devices - List pending and paired devices
api.get('/devices', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure clawdbot is running first
    await ensureClawdbotGateway(sandbox, c.env);

    // Run clawdbot CLI to list devices
    const proc = await sandbox.startProcess('clawdbot devices list --json');

    // Wait for command to complete
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      if (proc.status !== 'running') break;
      attempts++;
    }

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Try to parse JSON output
    try {
      // Find JSON in output (may have other log lines)
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return c.json(data);
      }

      // If no JSON found, return raw output
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
      });
    } catch {
      return c.json({
        pending: [],
        paired: [],
        raw: stdout,
        stderr,
        parseError: 'Failed to parse CLI output',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/devices/:requestId/approve - Approve a pending device
api.post('/devices/:requestId/approve', async (c) => {
  const sandbox = c.get('sandbox');
  const requestId = c.req.param('requestId');

  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  try {
    // Ensure clawdbot is running first
    await ensureClawdbotGateway(sandbox, c.env);

    // Run clawdbot CLI to approve the device
    const proc = await sandbox.startProcess(`clawdbot devices approve ${requestId}`);

    // Wait for command to complete
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      if (proc.status !== 'running') break;
      attempts++;
    }

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    // Check for success indicators
    const success = stdout.includes('approved') || proc.exitCode === 0;

    return c.json({
      success,
      requestId,
      message: success ? 'Device approved' : 'Approval may have failed',
      stdout,
      stderr,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/devices/approve-all - Approve all pending devices
api.post('/devices/approve-all', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Ensure clawdbot is running first
    await ensureClawdbotGateway(sandbox, c.env);

    // First, get the list of pending devices
    const listProc = await sandbox.startProcess('clawdbot devices list --json');

    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      if (listProc.status !== 'running') break;
      attempts++;
    }

    const listLogs = await listProc.getLogs();
    const stdout = listLogs.stdout || '';

    // Parse pending devices
    let pending: Array<{ requestId: string }> = [];
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        pending = data.pending || [];
      }
    } catch {
      return c.json({ error: 'Failed to parse device list', raw: stdout }, 500);
    }

    if (pending.length === 0) {
      return c.json({ approved: [], message: 'No pending devices to approve' });
    }

    // Approve each pending device
    const results: Array<{ requestId: string; success: boolean; error?: string }> = [];

    for (const device of pending) {
      try {
        const approveProc = await sandbox.startProcess(`clawdbot devices approve ${device.requestId}`);

        let approveAttempts = 0;
        while (approveAttempts < 10) {
          await new Promise(r => setTimeout(r, 500));
          if (approveProc.status !== 'running') break;
          approveAttempts++;
        }

        const approveLogs = await approveProc.getLogs();
        const success = approveLogs.stdout?.includes('approved') || approveProc.exitCode === 0;

        results.push({ requestId: device.requestId, success });
      } catch (err) {
        results.push({
          requestId: device.requestId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const approvedCount = results.filter(r => r.success).length;
    return c.json({
      approved: results.filter(r => r.success).map(r => r.requestId),
      failed: results.filter(r => !r.success),
      message: `Approved ${approvedCount} of ${pending.length} device(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// POST /api/gateway/restart - Kill the current gateway and start a new one
api.post('/gateway/restart', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Find and kill the existing gateway process
    const existingProcess = await findExistingClawdbotProcess(sandbox);
    
    if (existingProcess) {
      console.log('Killing existing gateway process:', existingProcess.id);
      try {
        await existingProcess.kill();
      } catch (killErr) {
        console.error('Error killing process:', killErr);
      }
      // Wait a moment for the process to die
      await new Promise(r => setTimeout(r, 2000));
    }

    // Start a new gateway in the background
    const bootPromise = ensureClawdbotGateway(sandbox, c.env).catch((err) => {
      console.error('Gateway restart failed:', err);
    });
    c.executionCtx.waitUntil(bootPromise);

    return c.json({
      success: true,
      message: existingProcess 
        ? 'Gateway process killed, new instance starting...'
        : 'No existing process found, starting new instance...',
      previousProcessId: existingProcess?.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

export { api };
