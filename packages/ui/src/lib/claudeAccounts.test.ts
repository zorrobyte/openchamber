import { beforeEach, describe, expect, mock, test } from 'bun:test';

const runtimeFetch = mock<(...args: unknown[]) => Promise<unknown>>();
const calls: unknown[][] = [];
await mock.module('@/lib/runtime-fetch', () => ({ runtimeFetch: (...args: unknown[]) => { calls.push(args); return runtimeFetch(...args); } }));

const { deleteClaudeAccount, fetchExtraClaudeAccountIds } = await import('./claudeAccounts');

beforeEach(() => { runtimeFetch.mockReset(); });

describe('deleteClaudeAccount', () => {
  test('sends the login-data choice with the delete', async () => {
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    await deleteClaudeAccount('claude-code-2', true);
    const [url, init] = calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/quota/claude-accounts/claude-code-2');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ deleteLoginData: true });
  });

  test('surfaces the server error message', async () => {
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Refusing to delete this folder' }) }));
    await deleteClaudeAccount('claude-code-2', true).then(() => { throw new Error('expected a rejection'); }, (error: Error) => expect(error.message).toBe('Refusing to delete this folder'));
  });
});

describe('fetchExtraClaudeAccountIds', () => {
  test('lists the deletable accounts and is empty on failure', async () => {
    runtimeFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ second: true, accounts: ['claude-code-2'] }) }));
    expect(await fetchExtraClaudeAccountIds()).toEqual(['claude-code-2']);
    runtimeFetch.mockImplementation(() => Promise.reject(new Error('offline')));
    expect(await fetchExtraClaudeAccountIds()).toEqual([]);
  });
});
