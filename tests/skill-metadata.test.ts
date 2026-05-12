import { describe, expect, it } from 'vitest';
import {
  addInstallMetadataToSkillMd,
  buildUpdateCommand,
  normalizeInstallMetadata,
} from '../src/skill-metadata.ts';

describe('skill metadata annotation', () => {
  it('adds agentart install metadata to an existing frontmatter block', () => {
    const raw = `---
name: my-skill
description: Test skill
---
# My Skill
`;

    const next = addInstallMetadataToSkillMd(raw, {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo.git',
      ref: '',
      skillPath: 'skills/my-skill/SKILL.md',
      installedAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
      pluginName: null,
      updateCommand: 'agentart update my-skill -p',
    });

    expect(next).toContain('metadata:\n');
    expect(next).toContain('  source: "owner/repo"\n');
    expect(next).toContain('  sourceType: "github"\n');
    expect(next).toContain('  sourceUrl: "https://github.com/owner/repo.git"\n');
    expect(next).not.toContain('  ref: ""');
    expect(next).not.toContain('pluginName:');
    expect(next).toContain('  agentart: "https://github.com/vercel-labs/agentart"\n');
    expect(next).toContain('  updateCommand: "agentart update my-skill -p"\n');
    expect(next).toContain('# My Skill\n');
  });

  it('preserves existing metadata while replacing agentart-managed keys', () => {
    const raw = `---
name: my-skill
description: Test skill
metadata:
  author: example-org
  version: "1.0"
  source: "old/source"
  internal: true
---
# My Skill
`;

    const next = addInstallMetadataToSkillMd(raw, {
      source: 'owner/repo',
      sourceType: 'github',
      updateCommand: 'agentart update my-skill -g',
    });

    expect(next).toContain('  author: example-org\n');
    expect(next).toContain('  version: "1.0"\n');
    expect(next).toContain('  internal: true\n');
    expect(next).toContain('  source: "owner/repo"\n');
    expect(next).not.toContain('old/source');
  });

  it('normalizes metadata and skips null or empty values', () => {
    expect(
      normalizeInstallMetadata({
        source: 'owner/repo',
        sourceType: 'github',
        ref: undefined,
        skillPath: '',
        pluginName: null,
      })
    ).toEqual({
      source: 'owner/repo',
      sourceType: 'github',
      agentart: 'https://github.com/vercel-labs/agentart',
    });
  });

  it('builds scope-aware update commands', () => {
    expect(
      buildUpdateCommand({
        skillName: 'my skill',
        global: true,
        sourceInput: 'owner/repo',
        canUseUpdateCommand: true,
      })
    ).toBe("agentart update 'my skill' -g");

    expect(
      buildUpdateCommand({
        skillName: 'my skill',
        global: false,
        sourceInput: '/tmp/my skills',
        canUseUpdateCommand: false,
      })
    ).toBe("agentart add '/tmp/my skills' --skill 'my skill' -y");
  });
});
