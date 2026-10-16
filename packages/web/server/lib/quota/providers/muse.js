import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildResult, toUsageWindow } from '../utils/index.js';

export const providerId = 'muse-code';
export const providerName = 'Muse';

// Meta has no usage endpoint: Muse reports usage only at the end of each
// streamed reply. The opencode-muse-fix OpenCode plugin saves that report here.
const defaultUsageFile = () => path.join(os.homedir(), '.local/share/opencode/muse-usage.json');

export const isConfigured = () => existsSync(defaultUsageFile());

// A window whose reset time has passed has started over, so nothing is used yet.
const toWindow = (window, windowSeconds, now) => {
  const resetAt = Number(window?.resets_at) * 1000;
  const usedPercent = Number(window?.used_percent);
  if (!Number.isFinite(resetAt) || !Number.isFinite(usedPercent)) return null;
  if (resetAt <= now) return toUsageWindow({ usedPercent: 0, windowSeconds, resetAt: null });
  return toUsageWindow({ usedPercent, windowSeconds, resetAt });
};

export const fetchQuota = async ({ usageFile = defaultUsageFile(), now = Date.now() } = {}) => {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(usageFile, 'utf8'));
  } catch (error) {
    const missing = error?.code === 'ENOENT';
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: !missing,
      error: missing ? 'Not configured' : 'Invalid usage file'
    });
  }

  const subscription = snapshot?.subscription;
  const windowMins = Number(subscription?.window?.window_duration_mins);
  const windows = {};
  const session = toWindow(subscription?.window, Number.isFinite(windowMins) ? windowMins * 60 : null, now);
  const weekly = toWindow(subscription?.weekly, 7 * 24 * 60 * 60, now);
  if (session) windows[Number.isFinite(windowMins) && windowMins % 60 === 0 ? `${windowMins / 60}h` : 'session'] = session;
  if (weekly) windows['7d'] = weekly;

  if (!session && !weekly) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'No quota data in response' });
  }
  return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows } });
};
