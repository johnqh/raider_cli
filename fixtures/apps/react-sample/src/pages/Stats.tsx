import { useEffect, useState } from 'react';
import { get } from '../api';

export default function Stats() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void get<Record<string, unknown>>('/api/stats').then(setStats);
  }, []);
  return <main><h1>Stats</h1><pre>{JSON.stringify(stats, null, 2)}</pre></main>;
}
