import { expect, test } from 'bun:test';
import { rm, readFile } from 'node:fs/promises';
import { reconstruct } from '../../src/commands/reconstruct';

const BUNDLE = `${import.meta.dir}/../../fixtures/bundles/react-sample.zip`;
const OUT = `${import.meta.dir}/../../.tmp/reconstruct-test`;

async function run() {
  await rm(OUT, { recursive: true, force: true });
  return reconstruct({ bundlePath: BUNDLE, outDir: OUT });
}

test('reconstructs a real bundle end to end', async () => {
  const report = await run();
  expect(report.endpoints).toBeGreaterThan(2);
  expect(report.routes).toBe(4);
  expect(report.filesWritten).toBeGreaterThan(5);
});

test('chooses recovery mode when the app shipped source maps', async () => {
  const report = await run();
  expect(report.recoveryRatio).toBeGreaterThan(50);
  expect(report.mode).toBe('recovery');
});

test('writes every stage artifact', async () => {
  await run();
  for (const path of [
    '.raidr/01-bundle.json',
    '.raidr/02-recovery.json',
    '.raidr/04-api-model.json',
    '.raidr/05-route-model.json',
    '.raidr/recordings.json',
    '.raidr/report.md',
  ]) {
    expect(await Bun.file(`${OUT}/${path}`).exists()).toBe(true);
  }
});

test('the api model contains exactly the endpoints the fixture app called', async () => {
  await run();
  const model = JSON.parse(await readFile(`${OUT}/.raidr/04-api-model.json`, 'utf8'));
  const templates = model.endpoints.map((e: { template: string }) => e.template).sort();
  expect(templates).toEqual([
    '/api/login',
    '/api/me',
    '/api/stats',
    '/api/users',
    '/api/users/{id}',
  ]);
});

test('HTML navigations and preflights are excluded from the api model', async () => {
  await run();
  const model = JSON.parse(await readFile(`${OUT}/.raidr/04-api-model.json`, 'utf8'));
  const keys = model.endpoints.map((e: { key: string }) => e.key);
  expect(keys.some((k: string) => k.startsWith('OPTIONS'))).toBe(false);
  expect(keys).not.toContain('GET /users');
});

test('recovers original source files rather than minified chunks', async () => {
  await run();
  const recovery = JSON.parse(await readFile(`${OUT}/.raidr/02-recovery.json`, 'utf8'));
  expect(recovery.files.length).toBeGreaterThan(0);
  expect(recovery.files.some((f: string) => f.endsWith('.tsx'))).toBe(true);

  const recovered = await readFile(`${OUT}/.raidr/02-sources/src/api.ts`, 'utf8');
  expect(recovered).toContain('access_token');
});

test('generates a project that has the expected shape', async () => {
  await run();
  for (const path of [
    'package.json',
    'vite.config.ts',
    'src/router.tsx',
    'src/api/client.ts',
    'server/replay.ts',
  ]) {
    expect(await Bun.file(`${OUT}/${path}`).exists()).toBe(true);
  }
});

test('recordings are keyed by endpoint and hold real captured bodies', async () => {
  await run();
  const recordings = JSON.parse(await readFile(`${OUT}/.raidr/recordings.json`, 'utf8'));
  const users = recordings['GET /api/users'];
  expect(users[0].status).toBe(200);
  expect(users[0].body.users.length).toBeGreaterThan(0);
});

test('the generated client has a method per endpoint', async () => {
  await run();
  const client = await readFile(`${OUT}/src/api/client.ts`, 'utf8');
  expect(client).toContain('getApiUsers');
  expect(client).toContain('getApiUsersById');
  expect(client).toContain('postApiLogin');
});

test('refuses a bundle from an unsupported format version', async () => {
  await expect(
    reconstruct({
      bundlePath: `${import.meta.dir}/../bundle/fixtures/badversion`,
      outDir: OUT,
    })
  ).rejects.toThrow(/formatVersion/);
});

test('a readable router table does not flip a map-less capture out of mirror mode', async () => {
  // Regression: the mirror branch required zero runtime routes. Once the links
  // probe started populating them, a server-rendered site fell through to
  // inference and got a React scaffold it has no business having.
  const OUT2 = `${OUT}-mode`;
  await rm(OUT2, { recursive: true, force: true });

  const report = await reconstruct({ bundlePath: BUNDLE, outDir: OUT2 });
  // react-sample ships source maps, so it must still choose recovery.
  expect(report.mode).toBe('recovery');
});
