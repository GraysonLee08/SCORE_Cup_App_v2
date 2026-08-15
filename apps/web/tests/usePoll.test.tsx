import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePoll } from '../src/components/spectator/usePoll.js';

/**
 * The board is built to be left open all day, so the expensive case is not
 * somebody watching it -- it is a phone in a pocket, a background tab, a laptop
 * lid closed at lunch. These cover the two rules that make pausing safe:
 * nothing fires while the page is hidden, and it catches up the instant the
 * page comes back.
 *
 * Driven with React's own `act` and `createRoot` rather than a testing library,
 * to avoid taking a new dependency this close to the tournament.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ run, delay }: { run: () => Promise<void>; delay: number }) {
  usePoll(run, delay);
  return null;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

let container: HTMLDivElement;
let root: Root;

function mount(run: () => Promise<void>, delay = 20_000) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness run={run} delay={delay} />);
  });
}

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('runs on the interval it was given', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    mount(run);

    // The first read belongs to the caller; this only handles the repeats.
    expect(run).toHaveBeenCalledTimes(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops entirely while the page is hidden', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    mount(run);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200_000); // ten cycles' worth
    });
    expect(run).toHaveBeenCalledTimes(0);
  });

  it('catches up the moment the page comes back', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    mount(run);

    act(() => setHidden(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200_000);
    });
    expect(run).toHaveBeenCalledTimes(0);

    // Returning must not wait out another full interval: a phone taken from a
    // pocket should show the current score, not one from before lunch.
    await act(async () => {
      setHidden(false);
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops when the board goes away', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    mount(run);

    act(() => root.unmount());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(run).toHaveBeenCalledTimes(0);

    // Re-mount an empty root so the shared teardown has something to unmount.
    root = createRoot(container);
  });
});
