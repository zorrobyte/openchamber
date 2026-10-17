/**
 * Antigravity Quota Provider
 *
 * Dedicated quota provider for Google Cloud Code Antigravity IDE and proxy tools.
 * Supports dual-layer quotas: 5-Hour rolling limits and 7-Day weekly limits.
 * @module quota/providers/antigravity
 */

import { buildResult } from '../../utils/index.js';
import { resolveAntigravityAuth, DEFAULT_PROJECT_ID } from './auth.js';
import { refreshAntigravityToken, fetchAntigravityQuotaSummary } from './api.js';
import { findAgy, readAgyUsage } from './agy.js';
import { transformPools } from './transforms.js';

export const providerId = 'antigravity';
export const providerName = 'Antigravity';

export const isConfigured = () => findAgy() !== null || resolveAntigravityAuth() !== null;

const fromSummary = (summaryPayload) => {
  const models = transformPools(summaryPayload);
  if (!Object.keys(models).length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Failed to fetch Antigravity quota'
    });
  }
  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage: { windows: {}, models }
  });
};

// The Antigravity CLI is the first source: it shows the same numbers as `agy /usage`, and
// Google's own client makes the request. The accounts file is the path for proxy-plugin users.
export const fetchQuota = async () => {
  const agy = findAgy();
  if (agy) return fromSummary(await readAgyUsage(agy));

  const auth = resolveAntigravityAuth();
  if (!auth) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  const accessToken = await refreshAntigravityToken(auth.refreshToken);
  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Failed to refresh Antigravity token'
    });
  }

  return fromSummary(await fetchAntigravityQuotaSummary(accessToken, auth.projectId ?? DEFAULT_PROJECT_ID));
};
