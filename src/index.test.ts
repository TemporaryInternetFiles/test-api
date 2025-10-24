import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, {
  resetCounterState,
  INCREMENT_INTERVAL_MS,
  INCREMENTS_PER_DAY,
  MAX_PENDING_INCREMENTS_BEFORE_PERSIST,
  MAX_PERSIST_INTERVAL_MS,
} from './index';

// Simple in-memory KV namespace mock
function createEnv() {
  const store = new Map<string, string>();
  const COUNTER = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as KVNamespace;
  return { COUNTER } as { COUNTER: KVNamespace };
}

describe('worker fetch', () => {
  let env: { COUNTER: KVNamespace };

  beforeEach(() => {
    env = createEnv();
    resetCounterState();
  });

  it('returns success with deterministic values and increments on schedule', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    const data1 = await res1.json();

    expect(data1.status).toBe('success');
    expect(data1.valuezero).toBe(0);
    expect(data1.valuerandompercent).toBe(50);
    expect(data1.valueincrement).toBe(1);

    const res2 = await worker.fetch(new Request('http://example.com'), env);
    const data2 = await res2.json();
    expect(data2.valueincrement).toBe(1);

    vi.advanceTimersByTime(INCREMENT_INTERVAL_MS);
    const res3 = await worker.fetch(new Request('http://example.com'), env);
    const data3 = await res3.json();
    expect(data3.valueincrement).toBe(2);

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('batches KV writes until persist interval elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const putSpy = vi.spyOn(env.COUNTER, 'put');

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    await res1.json();
    expect(putSpy).toHaveBeenCalledTimes(1);

    const incrementsBeforeTimeFlush = Math.floor(
      MAX_PERSIST_INTERVAL_MS / INCREMENT_INTERVAL_MS,
    );

    for (let i = 0; i < incrementsBeforeTimeFlush; i += 1) {
      vi.advanceTimersByTime(INCREMENT_INTERVAL_MS);
      const res = await worker.fetch(new Request('http://example.com'), env);
      await res.json();
    }

    expect(putSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INCREMENT_INTERVAL_MS);
    const resTrigger = await worker.fetch(new Request('http://example.com'), env);
    await resTrigger.json();
    expect(putSpy).toHaveBeenCalledTimes(2);

    putSpy.mockRestore();
    vi.useRealTimers();
  });

  it('persists when the pending increment threshold is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const putSpy = vi.spyOn(env.COUNTER, 'put');

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    await res1.json();
    expect(putSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(
      INCREMENT_INTERVAL_MS * (MAX_PENDING_INCREMENTS_BEFORE_PERSIST + 5),
    );
    const res2 = await worker.fetch(new Request('http://example.com'), env);
    await res2.json();
    expect(putSpy).toHaveBeenCalledTimes(2);

    putSpy.mockRestore();
    vi.useRealTimers();
  });

  it('caps total KV writes under the configured limits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const putSpy = vi.spyOn(env.COUNTER, 'put');

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    await res1.json();

    const iterations = INCREMENTS_PER_DAY * 2;
    for (let i = 0; i < iterations; i += 1) {
      const res = await worker.fetch(new Request('http://example.com'), env);
      await res.json();
      vi.advanceTimersByTime(Math.floor(INCREMENT_INTERVAL_MS / 2));
    }

    const totalDurationMs = INCREMENT_INTERVAL_MS * INCREMENTS_PER_DAY;
    const maxWritesFromTime = Math.ceil(totalDurationMs / MAX_PERSIST_INTERVAL_MS);
    const maxWritesFromPending = Math.ceil(
      INCREMENTS_PER_DAY / MAX_PENDING_INCREMENTS_BEFORE_PERSIST,
    );
    const expectedUpperBound = 1 + maxWritesFromTime + maxWritesFromPending;

    expect(putSpy.mock.calls.length).toBeLessThanOrEqual(expectedUpperBound);

    putSpy.mockRestore();
    vi.useRealTimers();
  });
});
