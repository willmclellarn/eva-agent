import { describe, it, expect, vi } from 'vitest';
import { findExistingClawdbotProcess } from './process';
import type { Sandbox, Process } from '@cloudflare/sandbox';

// Helper to create a mock process
function createMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'test-id',
    command: 'clawdbot gateway',
    status: 'running',
    startTime: new Date(),
    endTime: undefined,
    exitCode: undefined,
    waitForPort: vi.fn(),
    kill: vi.fn(),
    getLogs: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    ...overrides,
  } as Process;
}

// Helper to create a mock sandbox
function createMockSandbox(processes: Process[] = []): Sandbox {
  return {
    listProcesses: vi.fn().mockResolvedValue(processes),
    startProcess: vi.fn(),
    containerFetch: vi.fn(),
    wsConnect: vi.fn(),
    mountBucket: vi.fn(),
  } as unknown as Sandbox;
}

describe('findExistingClawdbotProcess', () => {
  it('returns null when no processes exist', async () => {
    const sandbox = createMockSandbox([]);
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBeNull();
  });

  it('returns null when only CLI commands are running', async () => {
    const processes = [
      createMockProcess({ command: 'clawdbot devices list --json', status: 'running' }),
      createMockProcess({ command: 'clawdbot --version', status: 'completed' }),
    ];
    const sandbox = createMockSandbox(processes);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBeNull();
  });

  it('returns gateway process when running', async () => {
    const gatewayProcess = createMockProcess({ 
      id: 'gateway-1',
      command: 'clawdbot gateway --port 18789', 
      status: 'running' 
    });
    const processes = [
      createMockProcess({ command: 'clawdbot devices list', status: 'completed' }),
      gatewayProcess,
    ];
    const sandbox = createMockSandbox(processes);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBe(gatewayProcess);
  });

  it('returns gateway process when starting', async () => {
    const gatewayProcess = createMockProcess({ 
      id: 'gateway-1',
      command: '/usr/local/bin/start-clawdbot.sh', 
      status: 'starting' 
    });
    const sandbox = createMockSandbox([gatewayProcess]);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBe(gatewayProcess);
  });

  it('ignores completed gateway processes', async () => {
    const processes = [
      createMockProcess({ command: 'clawdbot gateway', status: 'completed' }),
      createMockProcess({ command: 'start-clawdbot.sh', status: 'failed' }),
    ];
    const sandbox = createMockSandbox(processes);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBeNull();
  });

  it('handles listProcesses errors gracefully', async () => {
    const sandbox = {
      listProcesses: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as Sandbox;
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBeNull();
  });

  it('matches start-clawdbot.sh command', async () => {
    const gatewayProcess = createMockProcess({ 
      id: 'gateway-1',
      command: '/usr/local/bin/start-clawdbot.sh', 
      status: 'running' 
    });
    const sandbox = createMockSandbox([gatewayProcess]);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result).toBe(gatewayProcess);
  });

  it('returns first matching gateway process', async () => {
    const firstGateway = createMockProcess({ 
      id: 'gateway-1',
      command: 'clawdbot gateway', 
      status: 'running' 
    });
    const secondGateway = createMockProcess({ 
      id: 'gateway-2',
      command: 'start-clawdbot.sh', 
      status: 'starting' 
    });
    const sandbox = createMockSandbox([firstGateway, secondGateway]);
    
    const result = await findExistingClawdbotProcess(sandbox);
    expect(result?.id).toBe('gateway-1');
  });
});
