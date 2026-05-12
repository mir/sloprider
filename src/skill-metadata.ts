import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const AGENTART_GITHUB_URL = 'https://github.com/vercel-labs/agentart';

const INSTALL_METADATA_KEYS = [
  'source',
  'sourceType',
  'sourceUrl',
  'ref',
  'skillPath',
  'installedAt',
  'updatedAt',
  'pluginName',
  'agentart',
  'updateCommand',
] as const;

type InstallMetadataKey = (typeof INSTALL_METADATA_KEYS)[number];

export type InstallMetadata = Partial<Record<InstallMetadataKey, string | null | undefined>>;

export function quoteCommandArg(value: string): string {
  if (/^[A-Za-z0-9._/@:+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildUpdateCommand(options: {
  skillName: string;
  global: boolean;
  sourceInput: string;
  canUseUpdateCommand: boolean;
}): string {
  const scopeFlag = options.global ? '-g' : '-p';
  if (options.canUseUpdateCommand) {
    return `agentart update ${quoteCommandArg(options.skillName)} ${scopeFlag}`;
  }

  const globalFlag = options.global ? ' -g' : '';
  return `agentart add ${quoteCommandArg(options.sourceInput)} --skill ${quoteCommandArg(options.skillName)}${globalFlag} -y`;
}

export function normalizeInstallMetadata(metadata: InstallMetadata): Record<string, string> {
  const normalized: Record<string, string> = {};
  const withAgentart: InstallMetadata = {
    ...metadata,
    agentart: metadata.agentart || AGENTART_GITHUB_URL,
  };

  for (const key of INSTALL_METADATA_KEYS) {
    const value = withAgentart[key];
    if (value === null || value === undefined) continue;

    const stringValue = String(value).trim();
    if (!stringValue) continue;
    normalized[key] = stringValue;
  }

  return normalized;
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function getIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function isTopLevelKey(line: string): boolean {
  return getIndent(line) === 0 && /^[^#\s][^:]*:/.test(line);
}

function findMetadataBlock(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => getIndent(line) === 0 && /^metadata\s*:/.test(line));
  if (start === -1) return null;

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (line.trim() && isTopLevelKey(line)) break;
    end++;
  }

  return { start, end };
}

function isInstallMetadataLine(line: string): boolean {
  if (getIndent(line) !== 2) return false;
  const match = line.match(/^\s+([^:\s][^:]*):/);
  if (!match) return false;
  return INSTALL_METADATA_KEYS.includes(match[1]!.trim() as InstallMetadataKey);
}

function formatMetadataLines(metadata: Record<string, string>): string[] {
  return INSTALL_METADATA_KEYS.flatMap((key) => {
    const value = metadata[key];
    return value ? [`  ${key}: ${quoteYamlString(value)}`] : [];
  });
}

export function addInstallMetadataToSkillMd(raw: string, metadata: InstallMetadata): string {
  const normalized = normalizeInstallMetadata(metadata);
  const metadataLines = formatMetadataLines(normalized);
  if (metadataLines.length === 0) return raw;

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return `---\nmetadata:\n${metadataLines.join('\n')}\n---\n${raw}`;
  }

  const frontmatter = match[1] ?? '';
  const content = match[2] ?? '';
  const lines = frontmatter.split(/\r?\n/);
  const metadataBlock = findMetadataBlock(lines);

  let nextLines: string[];
  if (metadataBlock) {
    const before = lines.slice(0, metadataBlock.start);
    const metadataHeader = 'metadata:';
    const preservedMetadataLines = lines
      .slice(metadataBlock.start + 1, metadataBlock.end)
      .filter((line) => !isInstallMetadataLine(line));
    const after = lines.slice(metadataBlock.end);

    nextLines = [...before, metadataHeader, ...preservedMetadataLines, ...metadataLines, ...after];
  } else {
    nextLines = [...lines, 'metadata:', ...metadataLines];
  }

  return `---\n${nextLines.join('\n')}\n---\n${content}`;
}

export async function writeInstallMetadataToSkillDir(
  skillDir: string,
  metadata: InstallMetadata
): Promise<void> {
  const skillMdPath = join(skillDir, 'SKILL.md');
  const raw = await readFile(skillMdPath, 'utf-8');
  const next = addInstallMetadataToSkillMd(raw, metadata);
  if (next !== raw) {
    await writeFile(skillMdPath, next, 'utf-8');
  }
}
