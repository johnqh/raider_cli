export const API = 'http://localhost:8123';

let token: string | null = null;

export async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return (await response.json()) as T;
}

export async function login(): Promise<void> {
  const response = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'hunter2' }),
  });
  const body = (await response.json()) as { access_token: string };
  token = body.access_token;
}
