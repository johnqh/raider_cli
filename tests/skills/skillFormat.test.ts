import { expect, test } from 'bun:test';

const SKILL = `${import.meta.dir}/../../skills/reconstruct/SKILL.md`;
const INSTALL = `${import.meta.dir}/../../skills/reconstruct/INSTALL.md`;

async function frontmatter(): Promise<Record<string, string>> {
  const text = await Bun.file(SKILL).text();
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error('no frontmatter');
  const out: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

test('declares name and description', async () => {
  const fm = await frontmatter();
  expect(fm.name).toBeDefined();
  expect(fm.description).toBeDefined();
});

test('name uses only letters, numbers, and hyphens', async () => {
  expect((await frontmatter()).name).toMatch(/^[A-Za-z0-9-]+$/);
});

test('description states triggering conditions, not the workflow', async () => {
  const description = (await frontmatter()).description!;
  expect(description.startsWith('Use when')).toBe(true);
  // A description that summarizes the procedure invites agents to follow the
  // summary instead of reading the skill.
  for (const leak of [' then ', ' first ', ' step ', ' stage ']) {
    expect(description.toLowerCase()).not.toContain(leak);
  }
});

test('frontmatter stays within the 1024 character limit', async () => {
  const text = await Bun.file(SKILL).text();
  expect(/^---\n([\s\S]*?)\n---/.exec(text)![0].length).toBeLessThan(1024);
});

test('the skill names the exact command it drives', async () => {
  const text = await Bun.file(SKILL).text();
  expect(text).toContain('raider reconstruct');
  expect(text).toContain('--out');
});

test('the skill carries the gap rule', async () => {
  const text = await Bun.file(SKILL).text();
  expect(text).toContain('RAIDER-GAP');
});

test('the skill names every artifact the CLI actually writes', async () => {
  const text = await Bun.file(SKILL).text();
  for (const artifact of [
    'report.md',
    '02-sources',
    '03-chunks',
    '04-api-model.json',
    '05-route-model.json',
    'recordings.json',
  ]) {
    expect(text).toContain(artifact);
  }
});

test('installation instructions cover both install paths', async () => {
  const text = await Bun.file(INSTALL).text();
  expect(text).toContain('~/.claude/skills');
  expect(text).toContain('bun link');
});

test('the skill requires enumerating pages from the link audit, not just the route model', async () => {
  const text = await Bun.file(SKILL).text();
  expect(text).toContain('07-link-audit.json');
  expect(text).toContain('page inventory');
  // The distinction the skill exists to teach: reached vs linked.
  expect(text).toMatch(/capture \*reached\*/);
  expect(text).toMatch(/site \*links to\*/);
});

test('the completion report has four required parts', async () => {
  const text = await Bun.file(SKILL).text();
  for (const part of [
    'Build',
    'Pages served',
    'Unreachable links',
    'Re-capture list',
  ]) {
    expect(text).toContain(`**${part}**`);
  }
  // Empty sections must still appear, or omission reads as "nothing to report".
  expect(text).toContain('including when a section is empty');
});

test('the skill names the artifacts the CLI actually writes, including new ones', async () => {
  const text = await Bun.file(SKILL).text();
  for (const artifact of ['06-mirror.json', '07-link-audit.json']) {
    expect(text).toContain(artifact);
  }
});

test('mistakes table covers shipping a reconstruction with broken navigation', async () => {
  const text = await Bun.file(SKILL).text();
  expect(text).toContain('unreachablePages');
  expect(text).toMatch(/nav 404s/);
});

test('installation covers Claude Code, Codex, and the shared runtime path', async () => {
  const text = await Bun.file(INSTALL).text();
  for (const path of ['~/.claude/skills', '~/.codex/skills', '~/.agents/skills']) {
    expect(text).toContain(path);
  }
});

test('the skill states that it is runtime-neutral', async () => {
  const text = await Bun.file(SKILL).text();
  expect(text).toContain('## Runtime');
  expect(text).toMatch(/Codex/);
});

test('the skill does not depend on tools that may not be installed', async () => {
  // Bun is a hard requirement of the CLI; jq is not installed everywhere.
  // Mentioning jq in a comment is fine; invoking it is not.
  const text = await Bun.file(SKILL).text();
  expect(text).not.toMatch(/\$\(jq |\| ?jq |^jq /m);
});

test('installation documents the CLI install command for each runtime', async () => {
  const text = await Bun.file(INSTALL).text();
  for (const cmd of [
    'raider install --claude',
    'raider install --codex',
    'raider install --agents',
  ]) {
    expect(text).toContain(cmd);
  }
});
