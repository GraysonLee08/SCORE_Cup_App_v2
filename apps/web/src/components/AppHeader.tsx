import { Link } from 'react-router-dom';
import type { SessionUser } from '../types.js';

/**
 * One header across every view.
 *
 * It exists mainly so there is a visible way to sign in. Referees, coaches and
 * admins arrive by being told "go to the tournament site" -- nobody is going
 * to be told to type /sign-in, and a referee who cannot find the button at
 * Field 3 is a referee entering scores on paper.
 */
export default function AppHeader({
  user,
  title,
  subtitle,
  onSignOut,
}: {
  user: SessionUser | null;
  title: string;
  subtitle?: string;
  onSignOut?: () => void;
}) {
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="America SCORES Chicago — tournament home">
        <img src="/brand/AS-CHI-Horizontal.webp" alt="" width={132} height={38} />
      </Link>

      <div className="topbar-title">
        <strong>{title}</strong>
        {subtitle && <div className="who">{subtitle}</div>}
      </div>

      <div className="topbar-actions">
        {user ? (
          <>
            {homeFor(user) && (
              <Link className="topbar-link" to={homeFor(user)!}>
                {labelFor(user)}
              </Link>
            )}
            {onSignOut && (
              <button className="topbar-btn" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </>
        ) : (
          <>
            <Link className="topbar-link" to="/register">
              Register
            </Link>
            <Link className="topbar-btn" to="/sign-in">
              Sign in
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

function homeFor(user: SessionUser): string | null {
  switch (user.role) {
    case 'admin':
      return '/admin';
    case 'ref':
      return '/ref';
    case 'coach':
    case 'participant':
      return '/my-team';
    default:
      return null;
  }
}

function labelFor(user: SessionUser): string {
  switch (user.role) {
    case 'admin':
      return 'Admin';
    case 'ref':
      return 'My games';
    default:
      return 'My team';
  }
}
