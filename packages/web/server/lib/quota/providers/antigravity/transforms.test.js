import { describe, expect, it } from 'vitest';
import {
  parseBucket,
  transformSummary,
  transformPools,
  FIVE_HOUR_WINDOW_SECONDS,
  WEEKLY_WINDOW_SECONDS
} from './transforms.js';

const MOCK_SUMMARY_PAYLOAD = {
  groups: [
    {
      displayName: 'Gemini Models',
      description: 'Models within this group: Gemini Flash, Gemini Pro',
      buckets: [
        {
          bucketId: 'gemini-weekly',
          displayName: 'Weekly Limit Remaining',
          window: 'weekly',
          resetTime: '2026-10-08T14:29:35Z',
          remainingFraction: 0.59
        },
        {
          bucketId: 'gemini-5h',
          displayName: 'Five Hour Limit Remaining',
          window: '5h',
          resetTime: '2026-10-04T07:31:51Z',
          remainingFraction: 1.0
        }
      ]
    },
    {
      displayName: 'Claude and GPT models',
      description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS',
      buckets: [
        {
          bucketId: '3p-weekly',
          displayName: 'Weekly Limit Remaining',
          window: 'weekly',
          resetTime: '2026-10-10T10:01:17Z',
          remainingFraction: 0.46
        },
        {
          bucketId: '3p-5h',
          displayName: 'Five Hour Limit Remaining',
          window: '5h',
          resetTime: '2026-10-04T07:31:51Z',
          remainingFraction: 0.8
        }
      ]
    }
  ]
};

describe('Antigravity transforms', () => {
  it('parses buckets into standardized usage windows with 5h and weekly durations', () => {
    const weeklyBucket = parseBucket({
      bucketId: 'gemini-weekly',
      window: 'weekly',
      resetTime: '2026-10-08T14:29:35Z',
      remainingFraction: 0.6
    });

    expect(weeklyBucket.label).toBe('weekly');
    expect(weeklyBucket.seconds).toBe(WEEKLY_WINDOW_SECONDS);
    expect(weeklyBucket.window.remainingPercent).toBe(60);
    expect(weeklyBucket.window.usedPercent).toBe(40);
    expect(weeklyBucket.window.resetAt).toBe(Date.parse('2026-10-08T14:29:35Z'));

    const fiveHourBucket = parseBucket({
      bucketId: 'gemini-5h',
      window: '5h',
      resetTime: '2026-10-04T07:31:51Z',
      remainingFraction: 1.0
    });

    expect(fiveHourBucket.label).toBe('5h');
    expect(fiveHourBucket.seconds).toBe(FIVE_HOUR_WINDOW_SECONDS);
    expect(fiveHourBucket.window.remainingPercent).toBe(100);
    expect(fiveHourBucket.window.usedPercent).toBe(0);
  });

  it('parses summary groups into Gemini and 3P model-group windows', () => {
    const { modelGroupWindows } = transformSummary(MOCK_SUMMARY_PAYLOAD);

    expect(modelGroupWindows).toHaveLength(2);
    expect(modelGroupWindows[0].groupType).toBe('gemini');
    expect(modelGroupWindows[0].windows['5h'].remainingPercent).toBe(100);
    expect(modelGroupWindows[0].windows.weekly.remainingPercent).toBe(59);
    expect(modelGroupWindows[1].groupType).toBe('3p');
  });

  it('groups quota into one Gemini entry and one Claude & GPT entry, each with 5h then weekly', () => {
    const pools = transformPools(MOCK_SUMMARY_PAYLOAD);

    expect(Object.keys(pools)).toEqual(['Gemini', 'Claude & GPT']);
    expect(Object.keys(pools.Gemini.windows)).toEqual(['5h', 'weekly']);
    expect(pools.Gemini.windows['5h'].remainingPercent).toBe(100);
    expect(pools.Gemini.windows.weekly.remainingPercent).toBe(59);
    expect(pools['Claude & GPT'].windows['5h'].remainingPercent).toBe(80);
    expect(pools['Claude & GPT'].windows.weekly.remainingPercent).toBe(46);
  });

  it('returns no entries when the summary request failed', () => {
    expect(transformPools(null)).toEqual({});
  });
});
