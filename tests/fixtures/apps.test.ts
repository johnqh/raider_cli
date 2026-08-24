import { expect, test } from 'bun:test';
import { startFixtureApi } from '../../fixtures/api/server';

test('fixture api serves a user list', async () => {
  const server = startFixtureApi(0);
  try {
    const res = await fetch(`http://localhost:${server.port}/api/users`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ id: number }> };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users[0]!.id).toBeDefined();
  } finally {
    server.stop();
  }
});

test('detail endpoint returns a single user', async () => {
  const server = startFixtureApi(0);
  try {
    const res = await fetch(`http://localhost:${server.port}/api/users/1`);
    const body = (await res.json()) as { id: number; email: string };
    expect(body.id).toBe(1);
    expect(body.email).toContain('@');
  } finally {
    server.stop();
  }
});

test('the same endpoint returns different shapes by status', async () => {
  const server = startFixtureApi(0);
  try {
    const anon = await fetch(`http://localhost:${server.port}/api/me`);
    expect(anon.status).toBe(401);
    expect(((await anon.json()) as { error?: string }).error).toBeDefined();

    const authed = await fetch(`http://localhost:${server.port}/api/me`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(authed.status).toBe(200);
    expect(((await authed.json()) as { email?: string }).email).toBeDefined();
  } finally {
    server.stop();
  }
});

test('login returns a token that /api/me accepts', async () => {
  const server = startFixtureApi(0);
  try {
    const login = await fetch(`http://localhost:${server.port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'hunter2' }),
    });
    const { access_token } = (await login.json()) as { access_token: string };
    expect(access_token.startsWith('ey')).toBe(true);

    const me = await fetch(`http://localhost:${server.port}/api/me`, {
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(me.status).toBe(200);
  } finally {
    server.stop();
  }
});

test('optional fields are genuinely absent on some records', async () => {
  const server = startFixtureApi(0);
  try {
    const { users } = (await fetch(
      `http://localhost:${server.port}/api/users`
    ).then((r) => r.json())) as { users: Array<Record<string, unknown>> };
    expect(users.some((u: Record<string, unknown>) => u.nickname === undefined)).toBe(true);
    expect(users.some((u: Record<string, unknown>) => u.nickname !== undefined)).toBe(true);
  } finally {
    server.stop();
  }
});
