import { expect, test } from 'bun:test';
import { readlink, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRuntimes, skillSource } from '../../src/commands/install';

test('the skill source resolves to a real SKILL.md', async () => {
  expect(await Bun.file(join(skillSource(), 'SKILL.md')).exists()).toBe(true);
});

test('parses each runtime flag', () => {
  expect(parseRuntimes(['--claude'])).toEqual(['claude']);
  expect(parseRuntimes(['--codex'])).toEqual(['codex']);
  expect(parseRuntimes(['--agents'])).toEqual(['agents']);
});

test('--all covers every runtime', () => {
  expect(parseRuntimes(['--all'])).toEqual(['claude', 'codex', 'agents']);
});

test('several flags install several runtimes at once', () => {
  expect(parseRuntimes(['--claude', '--codex'])).toEqual(['claude', 'codex']);
});

test('no flag is an error, not a silent default', () => {
  // Installing somewhere the user did not ask for is worse than a usage message.
  expect(parseRuntimes([])).toBeNull();
  expect(parseRuntimes(['--nonsense'])).toBeNull();
});

test('linking is idempotent and repairs a stale link', async () => {
  const { install } = await import('../../src/commands/install');
  const fakeHome = `${import.meta.dir}/../../.tmp/install-home`;
  await rm(fakeHome, { recursive: true, force: true });
  await mkdir(join(fakeHome, '.claude/skills'), { recursive: true });

  try {
    const first = await install(['claude'], fakeHome);
    expect(first[0]!.action).toBe('linked');

    const second = await install(['claude'], fakeHome);
    expect(second[0]!.action).toBe('already-linked');

    // A link pointing at an old checkout loads a skill that no longer matches
    // the CLI it drives, so it must be repaired rather than left alone.
    await rm(first[0]!.target, { force: true });
    await Bun.write(join(fakeHome, 'elsewhere/SKILL.md'), '# old');
    await import('node:fs/promises').then((fs) =>
      fs.symlink(join(fakeHome, 'elsewhere'), first[0]!.target)
    );

    const third = await install(['claude'], fakeHome);
    expect(third[0]!.action).toBe('replaced');
    expect(await readlink(third[0]!.target)).toBe(skillSource());
  } finally {
    await rm(fakeHome, { recursive: true, force: true });
  }
});

test('refuses to delete a real directory sitting in the way', async () => {
  const { install } = await import('../../src/commands/install');
  const fakeHome = `${import.meta.dir}/../../.tmp/install-home2`;
  await rm(fakeHome, { recursive: true, force: true });
  const occupied = join(fakeHome, '.codex/skills/raidr-reconstruct');
  await mkdir(occupied, { recursive: true });
  await writeFile(join(occupied, 'SKILL.md'), '# someone else’s work');

  try {
    await expect(install(['codex'], fakeHome)).rejects.toThrow(
      /already exists and is not a link/
    );
    expect(await Bun.file(join(occupied, 'SKILL.md')).exists()).toBe(true);
  } finally {
    await rm(fakeHome, { recursive: true, force: true });
  }
});
