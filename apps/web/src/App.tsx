import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiFailure } from './api.js';
import type { SessionUser } from './types.js';
import Login from './pages/Login.js';
import RefView from './pages/RefView.js';
import Spectator from './pages/Spectator.js';
import Participant from './pages/Participant.js';
import Admin from './pages/Admin.js';
import Register from './pages/Register.js';
import ChangePassword from './pages/ChangePassword.js';

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

  // A temporary password may only reach the change-password screen.
  if (user?.mustChangePassword) {
    return <ChangePassword user={user} onDone={refresh} onSignOut={signOut} />;
  }

  const guard = (allowed: SessionUser['role'][], element: JSX.Element) =>
    user && allowed.includes(user.role) ? element : <Navigate to="/sign-in" replace />;

  return (
    <Routes>
      {/* The public view is the front door. No account needed to follow the day. */}
      <Route path="/" element={<Spectator />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/sign-in"
        element={user ? <Navigate to={homeFor(user)} replace /> : <Login onSignedIn={setUser} />}
      />
      <Route path="/ref" element={guard(['ref', 'admin'], <RefView user={user!} onSignOut={signOut} />)} />
      <Route
        path="/my-team"
        element={guard(['participant', 'coach', 'admin'], <Participant user={user!} onSignOut={signOut} />)}
      />
      <Route path="/admin" element={guard(['admin'], <Admin user={user!} onSignOut={signOut} />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function homeFor(user: SessionUser): string {
  switch (user.role) {
    case 'admin':
      return '/admin';
    case 'ref':
      return '/ref';
    default:
      return '/my-team';
  }
}
