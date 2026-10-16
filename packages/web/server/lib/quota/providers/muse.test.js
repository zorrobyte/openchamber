import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { fetchQuota } from './muse.js';

const now = 1_792_117_000_000;
const writeUsage = (body) => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'muse-quota-')), 'muse-usage.json');
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};

describe('Muse quota provider', () => {
  it('maps the saved subscription report to 5h and 7d windows', async () => {
    // Captured from a response.subscription_usage event on api.meta.ai/v1/responses.
    const usageFile = writeUsage({
      capturedAt: now,
      subscription: {
        tier: '27681631238169137',
        weekly: { resets_at: 1792368000, used_percent: 12 },
        window: { resets_at: 1792118317, used_percent: 40, window_duration_mins: 300 },
      },
    });

    const result = await fetchQuota({ usageFile, now });

    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBe(40);
    expect(result.usage.windows['5h'].windowSeconds).toBe(18000);
    expect(result.usage.windows['5h'].resetAt).toBe(1792118317000);
    expect(result.usage.windows['7d'].usedPercent).toBe(12);
  });

  it('shows a window whose reset has passed as unused', async () => {
    const usageFile = writeUsage({
      subscription: { window: { resets_at: now / 1000 - 1, used_percent: 90, window_duration_mins: 300 } },
    });

    const result = await fetchQuota({ usageFile, now });

    expect(result.usage.windows['5h'].usedPercent).toBe(0);
    expect(result.usage.windows['5h'].resetAt).toBeNull();
    expect(result.usage.windows['7d']).toBeUndefined();
  });

  it('reports not configured before the first Muse reply', async () => {
    const result = await fetchQuota({ usageFile: path.join(os.tmpdir(), 'missing-muse-usage.json'), now });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
  });

  it('rejects a corrupt usage file', async () => {
    const result = await fetchQuota({ usageFile: writeUsage('{'), now });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid usage file');
  });
});
