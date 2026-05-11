import { describe, expect, it } from 'vitest';
import { findSkillMdPaths, type RepoTree } from '../src/blob.ts';

function tree(paths: string[]): RepoTree {
  return {
    sha: 'root',
    branch: 'main',
    tree: paths.map((path) => ({ path, type: 'blob', sha: path })),
  };
}

describe('blob skill discovery', () => {
  it('returns all SKILL.md paths through depth 10 with priority ordering', () => {
    const repoTree = tree([
      'z/other/SKILL.md',
      'skills/priority/SKILL.md',
      'd0/d1/d2/d3/d4/d5/d6/d7/d8/d9/SKILL.md',
      'd0/d1/d2/d3/d4/d5/d6/d7/d8/d9/d10/SKILL.md',
      'node_modules/pkg/SKILL.md',
      'build/generated/SKILL.md',
    ]);

    expect(findSkillMdPaths(repoTree)).toEqual([
      'skills/priority/SKILL.md',
      'd0/d1/d2/d3/d4/d5/d6/d7/d8/d9/SKILL.md',
      'z/other/SKILL.md',
    ]);
  });

  it('preserves direct subpath single-skill behavior', () => {
    const repoTree = tree(['skills/parent/SKILL.md', 'skills/parent/children/child/SKILL.md']);

    expect(findSkillMdPaths(repoTree, 'skills/parent')).toEqual(['skills/parent/SKILL.md']);
  });
});
