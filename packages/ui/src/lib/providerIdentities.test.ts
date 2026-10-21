import { beforeEach, describe, expect, mock, test } from 'bun:test';

const runtimeFetch = mock<(...args: unknown[]) => Promise<unknown>>();
const calls: unknown[][] = [];
await mock.module('@/lib/runtime-fetch', () => ({ runtimeFetch: (...args: unknown[]) => { calls.push(args); return runtimeFetch(...args); } }));

const { fetchProviderIdentities } = await import('./providerIdentities');

beforeEach(() => { runtimeFetch.mockReset(); });

describe('fetchProviderIdentities', () => {
  test('returns the provider to email map', async () => {
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ identities: { 'claude-code': 'a@b.co' } }) }));
    expect(await fetchProviderIdentities()).toEqual({ 'claude-code': 'a@b.co' });
  });

  test('is empty when the server is missing, errors, or answers garbage', async () => {
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    expect(await fetchProviderIdentities()).toEqual({});
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ identities: 3 }) }));
    expect(await fetchProviderIdentities()).toEqual({});
    runtimeFetch.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await fetchProviderIdentities()).toEqual({});
  });
});
