import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { resetCounterState } from './index';

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

  it('returns success with deterministic values and increments counter', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const res1 = await worker.fetch(new Request('http://example.com'), env);
    const data1 = await res1.json();

    expect(data1.status).toBe('success');
    expect(data1.valuezero).toBe(0);
    expect(data1.valuerandompercent).toBe(50);
    expect(data1.valueincrement).toBe(1);

    const res2 = await worker.fetch(new Request('http://example.com'), env);
    const data2 = await res2.json();
    expect(data2.valueincrement).toBe(2);

    randomSpy.mockRestore();
  });

  it('throttles KV writes to at most one per second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const putSpy = vi.spyOn(env.COUNTER, 'put');

    await worker.fetch(new Request('http://example.com'), env);
    await worker.fetch(new Request('http://example.com'), env);
    expect(putSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await worker.fetch(new Request('http://example.com'), env);
    expect(putSpy).toHaveBeenCalledTimes(2);

    putSpy.mockRestore();
    vi.useRealTimers();
  });
});
