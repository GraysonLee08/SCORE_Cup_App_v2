export interface ApiError {
  error: string;
  code: string;
}

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as T & Partial<ApiError>;
  if (!res.ok) {
    throw new ApiFailure(
      res.status,
      payload?.code ?? 'error',
      payload?.error ?? 'Something went wrong.',
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// --- Offline queue ---------------------------------------------------------

export interface QueuedWrite {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  queuedAt: number;
}

const QUEUE_KEY = 'scorescup.pending-writes';

function readQueue(): QueuedWrite[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedWrite[];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedWrite[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function pendingCount(): number {
  return readQueue().length;
}

/**
 * Send a write, or hold it locally if the network is unavailable.
 *
 * Scoped deliberately small: the venue has good cell coverage, so this is
 * insurance against a dead zone or an accidental refresh, not a full
 * offline-first sync layer. Every queued write is safe to repeat -- scores are
 * idempotent by nature, and cards carry a client id the server dedupes on.
 */
export async function sendOrQueue(
  write: Omit<QueuedWrite, 'queuedAt'>,
): Promise<{ sent: boolean }> {
  try {
    await request(write.method, write.path, write.body);
    return { sent: true };
  } catch (error) {
    // A 4xx means the server understood and rejected it; retrying will not
    // help and would hide a real problem behind a spinner.
    if (error instanceof ApiFailure && error.status < 500) throw error;

    const queue = readQueue().filter((q) => q.id !== write.id);
    queue.push({ ...write, queuedAt: Date.now() });
    writeQueue(queue);
    return { sent: false };
  }
}

/** Retry everything held locally. Called on reconnect and on a timer. */
export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  const stillPending: QueuedWrite[] = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      await request(item.method, item.path, item.body);
      flushed++;
    } catch (error) {
      // Drop permanently-rejected writes rather than retrying forever.
      if (error instanceof ApiFailure && error.status < 500) continue;
      stillPending.push(item);
    }
  }

  writeQueue(stillPending);
  return { flushed, remaining: stillPending.length };
}

export function newClientId(): string {
  return crypto.randomUUID();
}
