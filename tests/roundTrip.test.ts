import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { $ } from 'bun';
import { reconstruct } from '../src/commands/reconstruct';

const OUT = `${import.meta.dir}/../.tmp/roundtrip`;
const TIMEOUT = 300_000;

async function waitForServer(port: number): Promise<boolean> {
  // Poll rather than sleep: the server is ready when it answers.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(`http://localhost:${port}/api/users`);
      return true;
    } catch {
      await Bun.sleep(100);
    }
  }
  return false;
}

test(
  'a reconstructed react project installs, typechecks, and builds',
  async () => {
    await rm(OUT, { recursive: true, force: true });
    await reconstruct({
      bundlePath: `${import.meta.dir}/../fixtures/bundles/react-sample.zip`,
      outDir: OUT,
    });

    await $`bun install`.cwd(OUT).quiet();

    const typecheck = await $`bun run typecheck`.cwd(OUT).nothrow().quiet();
    expect(typecheck.exitCode).toBe(0);

    const build = await $`bun run build`.cwd(OUT).nothrow().quiet();
    expect(build.exitCode).toBe(0);
  },
  TIMEOUT
);

test(
  'the replay server serves recorded endpoints and the SPA',
  async () => {
    const server = Bun.spawn(['bun', 'run', 'server/replay.ts'], {
      cwd: OUT,
      env: { ...process.env, PORT: '8899' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    try {
      expect(await waitForServer(8899)).toBe(true);

      const users = await fetch('http://localhost:8899/api/users');
      expect(users.status).toBe(200);
      const body = (await users.json()) as { users: unknown[] };
      expect(body.users.length).toBeGreaterThan(0);

      expect((await fetch('http://localhost:8899/api/users/1')).status).toBe(200);

      // Client-side routes must still resolve through the SPA fallback.
      expect((await fetch('http://localhost:8899/users')).status).toBe(200);
    } finally {
      server.kill();
    }
  },
  TIMEOUT
);

test(
  'an endpoint with no recording fails loudly instead of inventing data',
  async () => {
    const server = Bun.spawn(['bun', 'run', 'server/replay.ts'], {
      cwd: OUT,
      env: { ...process.env, PORT: '8900' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      expect(await waitForServer(8900)).toBe(true);

      const missing = await fetch('http://localhost:8900/api/never-captured');
      expect(missing.status).toBe(501);
      const body = (await missing.json()) as { error: string };
      expect(body.error).toBe('RAIDR-GAP');
    } finally {
      server.kill();
    }
  },
  TIMEOUT
);

test(
  'the vue bundle also reconstructs and builds',
  async () => {
    const vueOut = `${OUT}-vue`;
    await rm(vueOut, { recursive: true, force: true });
    const report = await reconstruct({
      bundlePath: `${import.meta.dir}/../fixtures/bundles/vue-sample.zip`,
      outDir: vueOut,
    });
    expect(report.endpoints).toBeGreaterThan(2);

    await $`bun install`.cwd(vueOut).quiet();
    const build = await $`bun run build`.cwd(vueOut).nothrow().quiet();
    expect(build.exitCode).toBe(0);
  },
  TIMEOUT
);
