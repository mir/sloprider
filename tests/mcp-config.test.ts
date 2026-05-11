import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  installMcpServerForAgent,
  listMcpServersForAgent,
  removeMcpServerForAgent,
} from '../src/mcp-config.ts';
import { parseMcpAddArgs } from '../src/mcp.ts';

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'agentart-mcp-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('MCP config', () => {
  it('parses stdio add args after -- separator', () => {
    const { server, options } = parseMcpAddArgs([
      'context7',
      '--env',
      'TOKEN=abc',
      '-a',
      'codex',
      '--',
      'npx',
      '-y',
      '@upstash/context7-mcp',
    ]);

    expect(options.agent).toEqual(['codex']);
    expect(server).toEqual({
      name: 'context7',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      env: { TOKEN: 'abc' },
    });
  });

  it('parses remote add args', () => {
    const { server } = parseMcpAddArgs(['docs', '--url', 'https://example.com/mcp']);
    expect(server).toEqual({
      name: 'docs',
      transport: 'http',
      url: 'https://example.com/mcp',
      headers: undefined,
    });
  });

  it('writes and removes mcpServers JSON while preserving other keys', async () => {
    await withTempDir(async (cwd) => {
      const path = join(cwd, '.cursor/mcp.json');
      await mkdir(join(cwd, '.cursor'), { recursive: true });
      await writeFile(
        path,
        JSON.stringify({ note: 'keep', mcpServers: { old: { command: 'old' } } })
      );

      await installMcpServerForAgent(
        {
          name: 'context7',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
        'cursor',
        { cwd }
      );

      const parsed = JSON.parse(await readFile(path, 'utf-8'));
      expect(parsed.note).toBe('keep');
      expect(parsed.mcpServers.old.command).toBe('old');
      expect(parsed.mcpServers.context7).toEqual({
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      });

      const listed = await listMcpServersForAgent('cursor', { cwd });
      expect(listed.map((server) => server.name).sort()).toEqual(['context7', 'old']);

      await removeMcpServerForAgent('context7', 'cursor', { cwd });
      const afterRemove = JSON.parse(await readFile(path, 'utf-8'));
      expect(afterRemove.mcpServers.context7).toBeUndefined();
      expect(afterRemove.mcpServers.old.command).toBe('old');
    });
  });

  it('writes Codex TOML blocks without removing unrelated config', async () => {
    await withTempDir(async (cwd) => {
      const path = join(cwd, '.codex/config.toml');
      await mkdir(join(cwd, '.codex'), { recursive: true });
      await writeFile(path, 'model = "gpt-5"\n\n[mcp_servers.old]\ncommand = "old"\n');

      await installMcpServerForAgent(
        {
          name: 'context7',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
        'codex',
        { cwd }
      );

      const content = await readFile(path, 'utf-8');
      expect(content).toContain('model = "gpt-5"');
      expect(content).toContain('[mcp_servers.old]');
      expect(content).toContain('[mcp_servers."context7"]');
      expect(content).toContain('args = ["-y", "@upstash/context7-mcp"]');

      const listed = await listMcpServersForAgent('codex', { cwd });
      expect(listed.map((server) => server.name).sort()).toEqual(['context7', 'old']);
      expect(listed.find((server) => server.name === 'context7')?.args).toEqual([
        '-y',
        '@upstash/context7-mcp',
      ]);

      await removeMcpServerForAgent('context7', 'codex', { cwd });
      const afterRemove = await readFile(path, 'utf-8');
      expect(afterRemove).toContain('model = "gpt-5"');
      expect(afterRemove).toContain('[mcp_servers.old]');
      expect(afterRemove).not.toContain('[mcp_servers."context7"]');
    });
  });
});
