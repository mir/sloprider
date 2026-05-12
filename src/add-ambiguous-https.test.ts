import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParsedSource, Skill } from './types.ts';

const mocks = vi.hoisted(() => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(),
  discoverSkills: vi.fn(),
  discoverMcpServers: vi.fn(),
}));

vi.mock('./git.ts', () => {
  class GitCloneError extends Error {
    readonly url: string;
    readonly isTimeout: boolean;
    readonly isAuthError: boolean;
    readonly isCanceled: boolean;

    constructor(
      message: string,
      url: string,
      isTimeout = false,
      isAuthError = false,
      isCanceled = false
    ) {
      super(message);
      this.name = 'GitCloneError';
      this.url = url;
      this.isTimeout = isTimeout;
      this.isAuthError = isAuthError;
      this.isCanceled = isCanceled;
    }
  }

  return {
    cloneRepo: mocks.cloneRepo,
    cleanupTempDir: mocks.cleanupTempDir,
    GitCloneError,
  };
});

vi.mock('./skills.ts', () => ({
  discoverSkills: mocks.discoverSkills,
  getSkillDisplayName: (skill: Skill) => skill.name,
  filterSkills: vi.fn(),
  getDuplicateSkillNameGroups: vi.fn(() => new Map()),
}));

vi.mock('./mcp-discovery.ts', () => ({
  discoverMcpServers: mocks.discoverMcpServers,
}));

const { tryCloneAmbiguousHttpsSource, shouldFallbackToWellKnownAfterCloneError } =
  await import('./add.ts');
const { GitCloneError } = await import('./git.ts');

describe('ambiguous HTTPS add sources', () => {
  const url = 'https://gitlab.semrush.net/ai/agent-marketplace';
  const parsed: ParsedSource = { type: 'well-known', url };
  const spinner = {
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  };
  const skill: Skill = {
    name: 'agent-marketplace',
    description: 'Marketplace skill',
    path: '/tmp/repo/skills/agent-marketplace',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discoverMcpServers.mockResolvedValue([]);
    mocks.cleanupTempDir.mockResolvedValue(undefined);
  });

  it('tries cloning the original HTTPS URL before considering well-known fallback', async () => {
    mocks.cloneRepo.mockResolvedValue('/tmp/repo');
    mocks.discoverSkills.mockResolvedValue([skill]);

    const result = await tryCloneAmbiguousHttpsSource(parsed, { list: true }, spinner, false);

    expect(mocks.cloneRepo).toHaveBeenCalledWith(url, undefined, expect.any(Object));
    expect(result?.skills).toEqual([skill]);
    expect(mocks.cleanupTempDir).not.toHaveBeenCalled();
  });

  it('falls back to well-known after an ordinary clone failure', async () => {
    const docsUrl = 'https://example.com/docs';
    const error = new GitCloneError(`Failed to clone ${docsUrl}: not a git repository`, docsUrl);
    mocks.cloneRepo.mockRejectedValue(error);

    const result = await tryCloneAmbiguousHttpsSource(
      { type: 'well-known', url: docsUrl },
      {},
      spinner,
      false
    );

    expect(mocks.cloneRepo).toHaveBeenCalledWith(docsUrl, undefined, expect.any(Object));
    expect(result).toBeNull();
    expect(shouldFallbackToWellKnownAfterCloneError(error)).toBe(true);
  });

  it('does not fall back after an auth clone failure', async () => {
    const error = new GitCloneError(`Authentication failed for ${url}`, url, false, true, false);
    mocks.cloneRepo.mockRejectedValue(error);

    await expect(tryCloneAmbiguousHttpsSource(parsed, {}, spinner, false)).rejects.toBe(error);
    expect(shouldFallbackToWellKnownAfterCloneError(error)).toBe(false);
  });

  it('does not fall back after timeout or cancellation clone failures', async () => {
    const timeout = new GitCloneError(`Clone timed out for ${url}`, url, true, false, false);
    const canceled = new GitCloneError(`Clone canceled for ${url}`, url, false, false, true);

    expect(shouldFallbackToWellKnownAfterCloneError(timeout)).toBe(false);
    expect(shouldFallbackToWellKnownAfterCloneError(canceled)).toBe(false);

    mocks.cloneRepo.mockRejectedValue(timeout);
    await expect(tryCloneAmbiguousHttpsSource(parsed, {}, spinner, false)).rejects.toBe(timeout);

    mocks.cloneRepo.mockRejectedValue(canceled);
    await expect(tryCloneAmbiguousHttpsSource(parsed, {}, spinner, false)).rejects.toBe(canceled);
  });

  it('does not fall back when clone succeeds with skills', async () => {
    mocks.cloneRepo.mockResolvedValue('/tmp/repo');
    mocks.discoverSkills.mockResolvedValue([skill]);

    const result = await tryCloneAmbiguousHttpsSource(parsed, {}, spinner, false);

    expect(result?.tempDir).toBe('/tmp/repo');
    expect(result?.skills).toHaveLength(1);
    expect(mocks.cleanupTempDir).not.toHaveBeenCalled();
  });

  it('falls back and cleans up when clone succeeds with zero skills', async () => {
    mocks.cloneRepo.mockResolvedValue('/tmp/repo');
    mocks.discoverSkills.mockResolvedValue([]);

    const result = await tryCloneAmbiguousHttpsSource(parsed, {}, spinner, false);

    expect(result).toBeNull();
    expect(mocks.cleanupTempDir).toHaveBeenCalledWith('/tmp/repo');
  });
});
