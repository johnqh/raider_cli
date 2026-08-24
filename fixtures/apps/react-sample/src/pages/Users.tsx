import { useEffect, useState } from 'react';
import { get } from '../api';

interface User { id: number; name: string }

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    void get<{ users: User[] }>('/api/users').then((r) => setUsers(r.users));
  }, []);
  return <main><h1>Users</h1><ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul></main>;
}
