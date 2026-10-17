/**
 * Antigravity Provider - Transforms
 *
 * Data transformation functions for Antigravity quota responses.
 * @module quota/providers/antigravity/transforms
 */

import {
  toNumber,
  toTimestamp,
  toUsageWindow
} from '../../utils/index.js';

export const FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
export const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;

export const parseBucket = (bucket) => {
  const remainingFraction = toNumber(bucket?.remainingFraction);
  const remainingPercent = remainingFraction !== null
    ? Math.round(remainingFraction * 100)
    : null;
  const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
  const resetAt = toTimestamp(bucket?.resetTime);
  const windowStr = (bucket?.window || bucket?.bucketId || '').toLowerCase();

  let label = '5h';
  let seconds = FIVE_HOUR_WINDOW_SECONDS;

  if (windowStr.includes('week') || windowStr.includes('7d')) {
    label = 'weekly';
    seconds = WEEKLY_WINDOW_SECONDS;
  } else if (windowStr.includes('day') || windowStr.includes('daily')) {
    label = 'daily';
    seconds = DAILY_WINDOW_SECONDS;
  } else {
    label = '5h';
    seconds = FIVE_HOUR_WINDOW_SECONDS;
  }

  return {
    label,
    seconds,
    remainingFraction: remainingFraction ?? 1,
    window: toUsageWindow({
      usedPercent,
      windowSeconds: seconds,
      resetAt
    })
  };
};

export const transformSummary = (summaryPayload) => {
  const groups = Array.isArray(summaryPayload?.groups) ? summaryPayload.groups : [];
  const modelGroupWindows = [];

  for (const group of groups) {
    const groupName = (group?.displayName || '').toLowerCase();
    const is3p = groupName.includes('claude') || groupName.includes('gpt') || groupName.includes('3p');
    const groupType = is3p ? '3p' : 'gemini';

    const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
    const windows = {};
    let bucket5h = null;
    let bucketWeekly = null;

    for (const b of buckets) {
      const parsed = parseBucket(b);
      windows[parsed.label] = parsed.window;
      if (parsed.label === '5h') {
        bucket5h = parsed;
      } else if (parsed.label === 'weekly') {
        bucketWeekly = parsed;
      }
    }

    modelGroupWindows.push({
      groupType,
      displayName: group?.displayName,
      windows,
      bucket5h,
      bucketWeekly
    });
  }

  // The card carries no top-level windows: each model row shows its own
  // group's 5h/weekly, so a single overview row would only mislead (for
  // example a Gemini 5h window shown for someone whose Claude limit is spent).
  return { modelGroupWindows };
};

// Antigravity meters two shared pools, Gemini and Claude + GPT, each with a 5h and a weekly limit.
// Every model in a pool draws from the same windows, so one entry per pool carries the whole picture.
export const transformPools = (summaryPayload) => {
  const pools = {};
  for (const group of transformSummary(summaryPayload).modelGroupWindows) {
    const windows = {};
    for (const label of ['5h', 'weekly', 'daily']) {
      if (group.windows[label]) windows[label] = group.windows[label];
    }
    if (Object.keys(windows).length > 0) pools[group.groupType === '3p' ? 'Claude & GPT' : 'Gemini'] = { windows };
  }
  return pools;
};
