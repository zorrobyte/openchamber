import { describe, expect, it } from 'vitest';

import { createPlanUsage, toAgentUsage } from './plan-usage.js';

const window = (usedPercent, resetAt) => ({ usedPercent, resetAt });

describe('plan usage for agents', () => {
  it('lists every limit of a provider, pool or model rows included', () => {
    const usage = toAgentUsage({
      providerId: 'antigravity',
      providerName: 'Antigravity',
      ok: true,
      usage: {
        windows: {},
        models: { Gemini: { windows: { '5h': window(2, Date.parse('2026-10-17T09:41:41Z')), weekly: window(1, null) } } },
      },
    });
    expect(usage).toEqual({
      provider: 'Antigravity',
      limits: [
        { limit: 'Gemini 5h', usedPercent: 2, resetsAt: '2026-10-17T09:41:41.000Z' },
        { limit: 'Gemini weekly', usedPercent: 1, resetsAt: null },
      ],
    });
  });

  it('keeps credit balances and reports a failed provider without hiding the rest', async () => {
    const read = createPlanUsage({
      listProviders: async () => ['deepseek', 'codex'],
      fetchQuota: async (id) => {
        if (id === 'codex') throw new Error('401 from usage endpoint');
        return { providerName: 'DeepSeek', ok: true, usage: { windows: { credits_balance: { usedPercent: null, resetAt: null, valueLabel: '$75.08' } } } };
      },
    });
    await expect(read()).resolves.toEqual({
      providers: [
        { provider: 'DeepSeek', limits: [{ limit: 'credits_balance', usedPercent: null, resetsAt: null, value: '$75.08' }] },
        { provider: 'codex', error: '401 from usage endpoint' },
      ],
    });
  });
});
