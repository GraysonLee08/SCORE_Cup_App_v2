import type React from 'react';
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
  extra,
  titleIsHeading,
}: {
  user: SessionUser | null;
  title: string;
  subtitle?: string;
  onSignOut?: () => void;
  /** Render the title as the page's `h1`. For views with no heading of their own. */
  titleIsHeading?: boolean;
  /**
   * A control belonging to this view, placed ahead of the account actions.
   * The spectator board puts its bright-sun switch here, because a control
   * for "I cannot read this" has to be visible without scrolling.
   */
  extra?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="America SCORES Chicago — tournament home">
        <img src="/brand/AS-CHI-Horizontal.webp" alt="" width={132} height={38} />
      </Link>

      <div className="topbar-title">
        {/* On a view whose content has no other title, this is the page's
            heading and not merely bold text -- without it the document outline
            starts at h2 and a screen reader has no top of the page. Views that
            render their own h1 (admin, sign-in) leave it as it was. */}
        {titleIsHeading ? (
          <h1 className="topbar-name">{title}</h1>
        ) : (
          <strong className="topbar-name">{title}</strong>
        )}
        {subtitle && <div className="who">{subtitle}</div>}
      </div>

      <div className="topbar-actions">
        {extra}
        {user ? (
          <>
            {/* Clicking the logo goes here too, but nobody discovers that. Once
                you are on My Team there is otherwise no visible way back to the
                tournament you came from. */}
            <Link className="topbar-link" to="/">
              Tournament
            </Link>
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
