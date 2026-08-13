import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import type { AdminDivision, AdminEvent, AdminStage } from '../../../types.js';

interface Timing {
  halfMinutes: number;
  halftimeMinutes: number;
  changeoverMinutes: number;
}

interface StageConfigShape {
  timing?: Partial<Timing>;
  gapBeforeMinutes?: number;
}

const DEFAULTS: Timing = { halfMinutes: 14, halftimeMinutes: 2, changeoverMinutes: 5 };

/**
 * How long a game takes, and how long the pitch sits empty afterwards.
 *
 * These numbers already decided the whole shape of the day; they just had no
 * interface, which meant the length of a game could not be changed at all.
 *
 * The inputs are the boring part. What matters is the panel underneath: it
 * shows the kickoff times the settings produce, because "45-minute slots"
 * means nothing and "9:00, 9:45, 10:30" is the thing an organiser is actually
 * deciding.
 */
export default function TimingWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];

  if (!division) {
    return (
      <div className="widget">
        <section className="card">
          <h2>No divisions yet</h2>
          <p className="hint">Add one under Divisions first.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="widget">
      {data.divisions.length > 1 && (
        <div className="field" style={{ maxWidth: '22rem' }}>
          <label htmlFor="tm-division">Division</label>
          <select
            id="tm-division"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            {data.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <DivisionStart
        key={`${division.id}:${division.startTime ?? ''}`}
        division={division}
        eventStartTime={data.event.startTime}
        onChanged={onChanged}
      />

      {division.stages.length === 0 && (
        <section className="card">
          <h2>{division.name} has no rounds yet</h2>
          <p className="hint">Add pool play or a knockout stage under Divisions.</p>
        </section>
      )}

      {[...division.stages]
        .sort((a, b) => a.sequence - b.sequence)
        .map((stage, index) => (
          <StageTiming
            key={stage.id}
            stage={stage}
            division={division}
            eventStartTime={division.startTime ?? data.event.startTime}
            isFirst={index === 0}
            onChanged={onChanged}
          />
        ))}
    </div>
  );
}

/**
 * When this division's first game kicks off.
 *
 * Left blank, the schedule works it out -- which is right for a single
 * tournament, and was the only option until now. Set, it is honoured: a
 * division whose 1:30 start has already gone out to teams is not a
 * consequence of how the morning ran, it is a commitment.
 *
 * It does not license a double booking. A pitch still hosts one game at a
 * time, so two divisions whose times overlap get fitted around each other and
 * the build reports it if this division had to wait for grass.
 */
function DivisionStart({
  division,
  eventStartTime,
  onChanged,
}: {
  division: AdminDivision;
  eventStartTime: string;
  onChanged: () => void;
}) {
  const [pinned, setPinned] = useState(division.startTime !== null);
  const [time, setTime] = useState(division.startTime ?? eventStartTime);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = pinned !== (division.startTime !== null) || (pinned && time !== division.startTime);

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>{division.name} starts</h2>
        <span className="pill">
          {division.startTime ? `${to12Hour(division.startTime)}` : 'Worked out for you'}
        </span>
      </div>

      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <div className="checkbox-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          Start this division at a set time
        </label>
      </div>

      {pinned ? (
        <div className="field" style={{ maxWidth: '12rem' }}>
          <label htmlFor={`start-${division.id}`}>First kickoff</label>
          <input
            id={`start-${division.id}`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      ) : (
        <p className="hint">
          The schedule decides — the tournament opens at {to12Hour(eventStartTime)}, and with
          more than one division the later ones follow on once the pitches are free.
        </p>
      )}

      {pinned && (
        <p className="hint">
          Games will not start before {to12Hour(time)}. If another division is still playing
          on the pitches at that point, this one waits for them and the build will tell you —
          a pitch can only host one game at a time.
        </p>
      )}

      <button
        className="primary"
        style={{ maxWidth: '16rem' }}
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          setStatus(null);
          try {
            await api.patch(`/api/setup/divisions/${division.id}`, {
              startTime: pinned ? time : null,
            });
            setStatus({ ok: true, text: 'Saved. Rebuild the schedule to apply it.' });
            onChanged();
          } catch (error) {
            setStatus({
              ok: false,
              text: error instanceof ApiFailure ? error.message : 'Could not save it.',
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saving…' : dirty ? 'Save start time' : 'Saved'}
      </button>
    </section>
  );
}

function to12Hour(time: string): string {
  const [h = '0', m = '00'] = time.split(':');
  const hour = globalThis.Number(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

function StageTiming({
  stage,
  division,
  eventStartTime,
  isFirst,
  onChanged,
}: {
  stage: AdminStage;
  division: AdminDivision;
  eventStartTime: string;
  isFirst: boolean;
  onChanged: () => void;
}) {
  const config = (stage.config ?? {}) as StageConfigShape;
  const stored: Timing = {
    halfMinutes: config.timing?.halfMinutes ?? DEFAULTS.halfMinutes,
    halftimeMinutes: config.timing?.halftimeMinutes ?? DEFAULTS.halftimeMinutes,
    changeoverMinutes: config.timing?.changeoverMinutes ?? DEFAULTS.changeoverMinutes,
  };

  const [timing, setTiming] = useState<Timing>(stored);
  const [gap, setGap] = useState<number>(config.gapBeforeMinutes ?? 15);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTiming(stored);
    setGap(config.gapBeforeMinutes ?? 15);
    // Re-seed only when the saved values actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stored.halfMinutes,
    stored.halftimeMinutes,
    stored.changeoverMinutes,
    config.gapBeforeMinutes,
  ]);

  const play = timing.halfMinutes * 2 + timing.halftimeMinutes;
  const slot = play + timing.changeoverMinutes;

  const dirty =
    timing.halfMinutes !== stored.halfMinutes ||
    timing.halftimeMinutes !== stored.halftimeMinutes ||
    timing.changeoverMinutes !== stored.changeoverMinutes ||
    (!isFirst && gap !== (config.gapBeforeMinutes ?? 15));

  return (
    <section className="card">
      <div className="meta">
        <h2 style={{ margin: 0, flex: 1 }}>
          {division.name} — {stage.name}
        </h2>
        <span className="pill">{slot} min per slot</span>
      </div>

      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      <div className="grid-2">
        <Number
          id={`half-${stage.id}`}
          label="Half length"
          suffix="min each"
          value={timing.halfMinutes}
          min={1}
          max={90}
          onChange={(v) => setTiming((t) => ({ ...t, halfMinutes: v }))}
        />
        <Number
          id={`ht-${stage.id}`}
          label="Half-time"
          suffix="min"
          value={timing.halftimeMinutes}
          min={0}
          max={60}
          onChange={(v) => setTiming((t) => ({ ...t, halftimeMinutes: v }))}
        />
        <Number
          id={`co-${stage.id}`}
          label="Gap between rounds"
          suffix="min"
          value={timing.changeoverMinutes}
          min={0}
          max={120}
          onChange={(v) => setTiming((t) => ({ ...t, changeoverMinutes: v }))}
        />
        {!isFirst && (
          <Number
            id={`gap-${stage.id}`}
            label="Wait after the previous round"
            suffix="min"
            value={gap}
            min={0}
            max={480}
            onChange={setGap}
          />
        )}
      </div>

      <dl className="kv">
        <div>
          <dt>A game lasts</dt>
          <dd>
            {play} min — two halves of {timing.halfMinutes}
            {timing.halftimeMinutes > 0 && `, ${timing.halftimeMinutes} at the break`}
          </dd>
        </div>
        <div>
          <dt>A pitch turns over every</dt>
          <dd>
            {slot} min — {play} playing, {timing.changeoverMinutes} to clear and set up
          </dd>
        </div>
        {isFirst ? (
          <div>
            <dt>Kickoffs</dt>
            <dd>{kickoffPreview(eventStartTime, slot, 6)}</dd>
          </div>
        ) : (
          <div>
            <dt>Starts</dt>
            <dd>
              {gap} min after the previous round's last whistle — time to work out who
              qualified and get them to the right pitch
            </dd>
          </div>
        )}
      </dl>

      <p className="hint">
        This decides the shape of the day but does not move games that already exist.
        Rebuild the schedule under Generate schedule for it to take effect.
      </p>

      <button
        className="primary"
        style={{ maxWidth: '16rem' }}
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          setStatus(null);
          try {
            await api.put(`/api/setup/stages/${stage.id}/timing`, {
              ...timing,
              ...(isFirst ? {} : { gapBeforeMinutes: gap }),
            });
            setStatus({ ok: true, text: 'Saved. Rebuild the schedule to apply it.' });
            onChanged();
          } catch (error) {
            setStatus({
              ok: false,
              text: error instanceof ApiFailure ? error.message : 'Could not save it.',
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saving…' : dirty ? 'Save timings' : 'Saved'}
      </button>
    </section>
  );
}

function Number({
  id,
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="muted">({suffix})</span>
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const next = globalThis.Number(e.target.value);
          if (!globalThis.Number.isNaN(next)) onChange(next);
        }}
      />
    </div>
  );
}

/**
 * The times this cadence actually produces, so the consequence is visible
 * before anyone commits to it. Only honest for a division's first stage --
 * anything later depends on when the one before it finishes.
 */
function kickoffPreview(startTime: string, slot: number, count: number): string {
  const [h, m] = startTime.split(':').map((n) => globalThis.Number(n));
  if (h === undefined || m === undefined || globalThis.Number.isNaN(h)) return '—';

  const times: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = h * 60 + m + i * slot;
    const hour = Math.floor(total / 60) % 24;
    const minute = total % 60;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    times.push(`${display}:${String(minute).padStart(2, '0')}${i === 0 ? ` ${suffix}` : ''}`);
  }
  return `${times.join(', ')}…`;
}
