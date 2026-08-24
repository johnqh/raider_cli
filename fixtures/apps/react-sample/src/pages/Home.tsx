import { useEffect, useState } from 'react';
import { get, login } from '../api';

export function Home() {
  const [me, setMe] = useState<{ name?: string } | null>(null);

  useEffect(() => {
    void (async () => {
      await login();
      setMe(await get<{ name: string }>('/api/me'));
    })();
  }, []);

  return <main><h1>Home</h1><p>{me?.name ?? 'loading'}</p></main>;
}
