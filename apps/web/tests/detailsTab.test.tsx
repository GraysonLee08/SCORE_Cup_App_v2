import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/**
 * "My details" is a player's own registration record -- emergency contact,
 * jersey size, date of birth. Someone who runs a team without playing in it has
 * no player record, and the tab used to open on a paragraph explaining that.
 *
 * A tab that exists only to say it has nothing for you is a dead end wearing
 * the costume of a section, so it is not offered at all. A captain who plays
 * still gets it, which is the case that matters here: captain and coach are the
 * same person, and they are on the roster.
 */
const get = vi.fn();
vi.mock('../src/api.js', () => ({
  api: {
    get: (path: string) => get(path),
    patch: vi.fn(),
    post: vi.fn(),
  },
  ApiFailure: class ApiFailure extends Error {
    constructor(readonly status: number, message: string, readonly code = 'error') {
      super(message);
    }
  },
  getRevalidated: (path: string) => get(path),
}));

const Participant = (await import('../src/pages/Participant.js')).default;

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const user = {
  id: 'u1',
  email: 'captain@example.com',
  role: 'coach' as const,
  displayName: 'Dana Whitfield',
  mustChangePassword: false,
};

const team = {
  team: { id: 't1', name: 'AbbVie' },
  division: { id: 'd1', name: 'Community' },
  eventId: 'e1',
  teammates: [],
  messages: [],
  isCoach: true,
};

const division = { id: 'd1', name: 'Community', pools: [], fixtures: [], teams: [] };

const profile = {
  id: 'p1',
  firstName: 'Dana',
  lastName: 'Whitfield',
  email: 'captain@example.com',
  phone: null,
  jerseySize: null,
  genderIdentity: null,
  dateOfBirth: null,
  priorParticipation: null,
  emergencyContactFirstName: null,
  emergencyContactLastName: null,
  emergencyContactPhone: null,
  teamName: 'AbbVie',
  teamId: 't1',
};

let host: HTMLDivElement;
let root: Root;

/** Renders the page with a profile lookup that either finds one or does not. */
async function render(onTheRoster: boolean) {
  get.mockImplementation((path: string) => {
    if (path === '/api/participant/me') return Promise.resolve(team);
    if (path.startsWith('/api/public/divisions/')) return Promise.resolve(division);
    if (path === '/api/register/my-profile') {
      return onTheRoster
        ? Promise.resolve({ profile, missingFields: [] })
        : Promise.reject(new Error('not on a roster'));
    }
    return Promise.resolve({});
  });

  await act(async () => {
    root.render(
      // The header carries a link, so the page needs a router around it.
      <MemoryRouter>
        <Participant user={user} onSignOut={() => undefined} />
      </MemoryRouter>,
    );
  });
  // Let the profile lookup settle, since the tab depends on its answer.
  await act(async () => {
    await Promise.resolve();
  });
}

const tabLabels = () =>
  [...host.querySelectorAll('nav.tabs button')].map((b) => b.textContent?.trim());

beforeEach(() => {
  get.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the My details tab', () => {
  it('is offered to someone who is on the roster', async () => {
    await render(true);
    expect(tabLabels()).toContain('My details');
  });

  it('is not offered to someone who runs a team without playing in it', async () => {
    await render(false);
    expect(tabLabels()).not.toContain('My details');
  });

  it('leaves the rest of the page alone either way', async () => {
    await render(false);
    // The tab going should not take the sections that do have something to say.
    expect(tabLabels()).toEqual(['My games', 'Standings', 'Roster']);
  });
});
