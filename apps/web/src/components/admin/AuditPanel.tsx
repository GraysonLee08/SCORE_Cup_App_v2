import { useEffect, useState } from 'react';
import { api } from '../../api.js';

interface AuditEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  actorName: string | null;
  actorRole: string | null;
}

const READABLE: Record<string, string> = {
  set_score: 'changed a score',
  record: 'recorded a card',
  delete: 'deleted a card',
  signoff: 'took a captain sign-off',
  login: 'signed in',
  create: 'created',
  generate_schedule: 'generated a schedule',
  generate_schedule_forced: 'regenerated a schedule, overwriting results',
  roster_add: 'added a player',
  roster_update: 'updated a player',
  roster_remove: 'removed a player',
  register: 'registered',
  register_merged: 'registered, merged into a coach entry',
  assign_fields: 'changed field assignments',
  issue_temp_password: 'issued a temporary password',
  auto_assign_pools: 'auto-assigned pools',
  rotate_join_code: 'rotated a join code',
  change_password: 'changed their password',
};

/**
 * "Who changed this, and when." The question that gets asked when a result is
 * disputed at the awards table, so it needs to read as a sentence rather than
 * as a database dump.
 */
export default function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api
      .get<{ entries: AuditEntry[] }>('/api/admin/audit?limit=300')
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]));
  }, []);

  const shown = filter
    ? entries.filter((e) =>
        `${e.actorName ?? ''} ${e.action} ${e.entityType}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
    : entries;

  return (
    <section className="card">
      <h2>History</h2>

      <div className="field">
        <label htmlFor="audit-filter">Filter</label>
        <input
          id="audit-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="A name, or “score”"
        />
      </div>

      {shown.length === 0 && <p className="muted">Nothing recorded yet.</p>}

      <ul className="cards-list">
        {shown.map((entry) => (
          <li key={entry.id} style={{ display: 'block' }}>
            <div>
              <strong>{entry.actorName ?? 'Someone'}</strong>{' '}
              {READABLE[entry.action] ?? entry.action}{' '}
              <span className="muted">({entry.entityType})</span>
            </div>
            <div className="muted">
              {new Date(entry.createdAt).toLocaleString()}
              {entry.action === 'set_score' && entry.after != null && (
                <>
                  {' — '}
                  {(entry.before as any)?.home_score != null
                    ? `was ${(entry.before as any).home_score}–${(entry.before as any).away_score}, `
                    : ''}
                  now {(entry.after as any).homeScore}–{(entry.after as any).awayScore}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
