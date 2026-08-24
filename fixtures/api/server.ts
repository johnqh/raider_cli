import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'member';
  nickname?: string;
  createdAt: string;
}

const USERS: User[] = [
  {
    id: 1,
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    role: 'admin',
    nickname: 'ada',
    createdAt: '2026-01-04T09:00:00.000Z',
  },
  {
    id: 2,
    email: 'alan@example.com',
    name: 'Alan Turing',
    role: 'member',
    createdAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: 3,
    email: 'grace@example.com',
    name: 'Grace Hopper',
    role: 'member',
    nickname: 'amazing grace',
    createdAt: '2026-03-27T09:00:00.000Z',
  },
];

// A structurally valid JWT whose payload is inert. Present so the capture
// exercises redaction's referential integrity: the token returned by /api/login
// is the one later requests carry in Authorization.
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwibmFtZSI6IkFkYSJ9.c2lnbmF0dXJlLXBsYWNlaG9sZGVy';

export function startFixtureApi(port: number) {
  const app = new Hono();
  app.use('/*', cors());

  app.get('/api/users', (c) => c.json({ users: USERS, total: USERS.length }));

  app.get('/api/users/:id', (c) => {
    const user = USERS.find((u) => u.id === Number(c.req.param('id')));
    return user ? c.json(user) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/api/login', async (c) => {
    const body = await c.req.json<{ email?: string }>();
    return c.json({
      access_token: TOKEN,
      expires_in: 3600,
      user: USERS.find((u) => u.email === body.email) ?? USERS[0],
    });
  });

  // Two shapes for one endpoint, so schema unification has a real union.
  app.get('/api/me', (c) => {
    const auth = c.req.header('authorization');
    if (!auth) return c.json({ error: 'unauthorized', code: 401 }, 401);
    return c.json(USERS[0]!);
  });

  app.get('/api/stats', (c) =>
    c.json({
      users: USERS.length,
      activeToday: 2,
      storageBytes: 1048576,
      lastSync: null,
    })
  );

  const server = Bun.serve({ port, fetch: app.fetch });
  return { port: server.port, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const { port } = startFixtureApi(8123);
  console.log(`fixture api on http://localhost:${port}`);
}
