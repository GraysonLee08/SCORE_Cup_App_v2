import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiFailure } from './api.js';
import type { SessionUser } from './types.js';
import Login from './pages/Login.js';
import RefView from './pages/RefView.js';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: SessionUser }>('/api/auth/me');
      setUser(res.user);
    } catch (error) {
      if (!(error instanceof ApiFailure) || error.status !== 401) {
        console.error('Could not load session', error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="content center muted">Loading…</div>
      </div>
    );
  }

  if (!user) return <Login onSignedIn={setUser} />;

  return (
    <Routes>
      <Route path="/ref" element={<RefView user={user} onSignOut={signOut} />} />
      <Route path="*" element={<Navigate to="/ref" replace />} />
    </Routes>
  );
}
