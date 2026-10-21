/**
 * Which account each provider is signed in as (an email), so identical-looking
 * provider cards can be told apart. Reads only the email fields of local
 * config files; tokens and keys are never read into the result.
 *
 * @module quota/identities
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_CLAUDE_ID = 'claude-code';

const defaultDataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const cleanEmail = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && trimmed.includes('@') ? trimmed : null;
};

const expandHome = (value, homeDir) =>
  value === '~' || value.startsWith('~/') ? path.join(homeDir, value.slice(1)) : value;

/**
 * Claude Code keeps the signed-in account in `.claude.json` (`oauthAccount`):
 * inside the config dir for a custom CLAUDE_CONFIG_DIR, next to it in the home
 * directory for the default `~/.claude`.
 */
export const readClaudeEmail = (configDir, { homeDir = os.homedir() } = {}) => {
  const candidates = [path.join(configDir, '.claude.json')];
  if (path.resolve(configDir) === path.resolve(path.join(homeDir, '.claude'))) {
    candidates.unshift(path.join(homeDir, '.claude.json'));
  }
  for (const file of candidates) {
    const email = cleanEmail(readJson(file)?.oauthAccount?.emailAddress);
    if (email) return email;
  }
  return null;
};

/** Muse (Meta) stores the signed-in user next to its tokens; only the email is read. */
export const readMuseEmail = ({ homeDir = os.homedir() } = {}) =>
  cleanEmail(readJson(path.join(homeDir, '.config', 'muse', 'auth.json'))?.providers?.meta?.user_email);

/** @returns {Record<string, string>} provider id to account email, omitting providers with no known identity */
export const readProviderIdentities = ({ homeDir = os.homedir(), dataHome = defaultDataHome(), env = process.env } = {}) => {
  const identities = {};
  const set = (providerId, email) => {
    if (email) identities[providerId] = email;
  };

  const defaultDir = env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(homeDir, '.claude');
  set(DEFAULT_CLAUDE_ID, readClaudeEmail(defaultDir, { homeDir }));

  const accounts = readJson(path.join(dataHome, 'opencode-claude', 'accounts.json'));
  for (const entry of Array.isArray(accounts) ? accounts : []) {
    if (typeof entry?.id !== 'string' || typeof entry?.configDir !== 'string' || !entry.configDir.trim()) continue;
    set(entry.id, readClaudeEmail(path.resolve(expandHome(entry.configDir.trim(), homeDir)), { homeDir }));
  }

  set('muse-code', readMuseEmail({ homeDir }));
  return identities;
};
