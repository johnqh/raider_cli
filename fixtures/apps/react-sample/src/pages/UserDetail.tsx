import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '../api';

export default function UserDetail() {
  const { id } = useParams();
  const [user, setUser] = useState<{ name?: string } | null>(null);
  useEffect(() => {
    void get<{ name: string }>(`/api/users/${id}`).then(setUser);
  }, [id]);
  return <main><h1>User {id}</h1><p>{user?.name ?? 'loading'}</p></main>;
}
