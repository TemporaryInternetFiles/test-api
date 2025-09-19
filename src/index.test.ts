import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { resetCounterState, INCREMENT_INTERVAL_MS } from './index';

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

  it('limits KV writes to the configured increment interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const putSpy = vi.spyOn(env.COUNTER, 'put');

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    await res1.json();
    expect(putSpy).toHaveBeenCalledTimes(1);

    const res2 = await worker.fetch(new Request('http://example.com'), env);
    await res2.json();
    expect(putSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(INCREMENT_INTERVAL_MS * 5);
    const res3 = await worker.fetch(new Request('http://example.com'), env);
    const data3 = await res3.json();
    expect(data3.valueincrement).toBe(6);
    expect(putSpy).toHaveBeenCalledTimes(2);

    const res4 = await worker.fetch(new Request('http://example.com'), env);
    await res4.json();
    expect(putSpy).toHaveBeenCalledTimes(2);

    putSpy.mockRestore();
    vi.useRealTimers();
  });
});
