import { describe, expect, it } from 'vitest';

import { findAgy, readAgyUsage, toQuotaSummary } from './agy.js';
import { transformPools } from './transforms.js';

// Trimmed from `agy --print /usage --output-format json` (agy 1.3.5).
const AGY_USAGE = JSON.stringify({
  status: 'SUCCESS',
  command: {
    name: 'usage',
    data: {
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            { id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.99, reset_time: '2026-10-24T04:41:41Z' },
            { id: 'gemini-5h', window: '5h', remaining_fraction: 0.98, reset_time: '2026-10-17T09:41:41Z' }
          ]
        },
        {
          name: 'Claude and GPT models',
          buckets: [
            { id: '3p-weekly', window: 'weekly', remaining_fraction: 1, reset_time: '2026-10-24T05:00:31Z' },
            { id: '3p-5h', window: '5h', remaining_fraction: 1, reset_time: '2026-10-17T10:00:31Z' }
          ]
        }
      ]
    }
  }
});

describe('Antigravity CLI usage', () => {
  it('turns agy /usage into one row per pool and window', async () => {
    const pools = transformPools(await readAgyUsage('/bin/agy', { run: async () => AGY_USAGE }));

    expect(Object.keys(pools)).toEqual(['Gemini', 'Claude & GPT']);
    expect(pools.Gemini.windows['5h'].usedPercent).toBe(2);
    expect(pools.Gemini.windows.weekly.usedPercent).toBe(1);
    expect(pools.Gemini.windows.weekly.resetAt).toBe(Date.parse('2026-10-24T04:41:41Z'));
    expect(pools['Claude & GPT'].windows['5h'].usedPercent).toBe(0);
  });

  it('reports nothing when agy fails or prints something else', async () => {
    expect(await readAgyUsage('/bin/agy', { run: async () => null })).toBeNull();
    expect(toQuotaSummary('Gemini Models\tWeekly Limit Remaining\t99%')).toBeNull();
    expect(toQuotaSummary(JSON.stringify({ status: 'ERROR' }))).toBeNull();
  });

  it('finds agy on PATH or in ~/.local/bin, where its installer puts it', () => {
    const exists = (file) => file === '/home/me/.local/bin/agy';
    expect(findAgy({ env: { PATH: '/usr/bin:/bin' }, homeDir: '/home/me', exists })).toBe('/home/me/.local/bin/agy');
    expect(findAgy({ env: { PATH: '/usr/bin' }, homeDir: '/home/me', exists: () => false })).toBeNull();
  });
});
