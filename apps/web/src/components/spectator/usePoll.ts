import { useEffect, useRef } from 'react';

/**
 * Re-read something on a timer, but only while somebody is looking.
 *
 * A `setInterval` keeps firing in a pocketed phone, a background tab and a
 * laptop lid that closed at lunch. The board's whole job is to be left open all
 * day, so that is not an edge case here -- it is the normal way it is used, and
 * it was costing a full re-read of the tournament every twenty seconds to tell
 * a dark screen that nothing had changed.
 *
 * Two rules make pausing safe. The chain stops the moment the page is hidden,
 * and it fires immediately when the page comes back, so a phone taken out of a
 * pocket shows the current score straight away rather than up to a poll late.
 *
 * The delay is read at the moment each cycle is scheduled rather than captured
 * once, so a caller can slow down or speed up -- a tournament that has not
 * started does not need the cadence of one in its second half -- without the
 * timer being torn down and restarted on every render.
 */
export function usePoll(run: () => Promise<void>, delayMs: number): void {
  const runRef = useRef(run);
  const delayRef = useRef(delayMs);
  runRef.current = run;
  delayRef.current = delayMs;

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void fire(), delayRef.current);
    };

    const fire = async () => {
      if (stopped || document.hidden) return;
      try {
        await runRef.current();
      } finally {
        // Scheduled after the run finishes, not alongside it, so a slow
        // response cannot stack requests on a weak connection.
        if (!stopped && !document.hidden) schedule();
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        return;
      }
      void fire();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
