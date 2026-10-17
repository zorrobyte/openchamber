/**
 * Antigravity Provider - CLI
 *
 * Reads plan usage from the Antigravity CLI (`agy`). Google's own client signs the request with
 * its own login, so OpenChamber never handles the user's Google token on this path.
 * @module quota/providers/antigravity/agy
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const USAGE_ARGS = ['--print', '/usage', '--output-format', 'json', '--print-timeout', '30s'];

// Desktop apps start with a short PATH, so also check where the agy installer puts the binary.
export const findAgy = ({ env = process.env, homeDir = os.homedir(), exists = existsSync } = {}) => {
  const dirs = [...(env.PATH ?? '').split(path.delimiter), path.join(homeDir, '.local', 'bin')];
  return dirs.filter(Boolean).map((dir) => path.join(dir, 'agy')).find((file) => exists(file)) ?? null;
};

const runAgy = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: 45_000 }, (error, stdout) => resolve(error ? null : stdout));
});

// `agy /usage` returns the same groups as Google's retrieveUserQuotaSummary, in snake_case.
export const toQuotaSummary = (stdout) => {
  let groups;
  try {
    groups = JSON.parse(stdout)?.command?.data?.groups;
  } catch {
    return null;
  }
  if (!Array.isArray(groups)) return null;
  return {
    groups: groups.map((group) => ({
      displayName: group?.name,
      buckets: (Array.isArray(group?.buckets) ? group.buckets : []).map((bucket) => ({
        bucketId: bucket?.id,
        window: bucket?.window,
        remainingFraction: bucket?.remaining_fraction,
        resetTime: bucket?.reset_time
      }))
    }))
  };
};

export const readAgyUsage = async (file, { run = runAgy } = {}) => toQuotaSummary(await run(file, USAGE_ARGS));
