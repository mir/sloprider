import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('discover command', () => {
  let sourceDir: string;
  let originalLog: typeof console.log;
  let logs: string[];

  beforeEach(() => {
    vi.resetModules();
    sourceDir = mkdtempSync(join(tmpdir(), 'agentart-discover-source-'));
    logs = [];
    originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ''));
    };

    vi.doMock('./git.ts', () => ({
      cleanupTempDir: vi.fn().mockResolvedValue(undefined),
      cloneRepo: vi.fn().mockResolvedValue(sourceDir),
      GitCloneError: class GitCloneError extends Error {},
    }));
    vi.doMock('@clack/prompts', () => ({
      default: {},
      intro: vi.fn(),
      outro: vi.fn(),
      multiselect: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn(),
      spinner: () => ({ start: vi.fn(), message: vi.fn(), stop: vi.fn() }),
      log: { warn: vi.fn(), success: vi.fn(), message: vi.fn(), error: vi.fn() },
    }));
  });

  afterEach(() => {
    console.log = originalLog;
    vi.restoreAllMocks();
    rmSync(sourceDir, { recursive: true, force: true });
  });

  it('prints inventory and an explicit install command without prompting', async () => {
    const skillDir = join(sourceDir, 'skills', 'alpha');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: alpha
description: Test alpha
---
# alpha
`
    );

    const prompts = await import('@clack/prompts');
    const { runDiscover } = await import('./discover.ts');

    await runDiscover(['https://example.com/acme/repo.git']);

    const output = logs.join('\n');
    expect(output).toContain('Skills:');
    expect(output).toContain('alpha - Test alpha');
    expect(output).toContain(
      'agentart install https://example.com/acme/repo.git --scope local --agents all --skills alpha'
    );
    expect(prompts.multiselect).not.toHaveBeenCalled();
    expect(prompts.select).not.toHaveBeenCalled();
    expect(prompts.confirm).not.toHaveBeenCalled();
  });
});
