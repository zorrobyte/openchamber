/**
 * A second Claude subscription for the opencode-claude plugin.
 *
 * The plugin turns each entry of `<data home>/opencode-claude/accounts.json`
 * into its own provider whose turns run Claude Code with that account's
 * CLAUDE_CONFIG_DIR, so the account has its own login, usage and limits.
 * Adding the account here creates its config dir, links in the settings the
 * default account uses, and saves the entry; the account then signs in from
 * its own provider card.
 *
 * @module quota/providers/claude/accounts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// shortcut: one extra account, the same one the `claude-2` quota provider reads;
// make this a list (and the quota provider per entry) if a third is ever needed.
const SECOND_ACCOUNT_ID = 'claude-code-2';
const SECOND_ACCOUNT_NAME = 'Claude Code (2)';

/** Shared from the default account, so both behave the same; logins and history stay separate. */
const SHARED_ENTRIES = ['CLAUDE.md', 'settings.json', 'skills', 'agents', 'commands', 'rules', 'plugins'];

const defaultDataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');

export const secondClaudeConfigDir = (homeDir = os.homedir()) => path.join(homeDir, '.claude-2');

const accountsFile = (dataHome) => path.join(dataHome, 'opencode-claude', 'accounts.json');

const readAccounts = (dataHome) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(accountsFile(dataHome), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const hasSecondClaudeAccount = ({ dataHome = defaultDataHome() } = {}) =>
  readAccounts(dataHome).some((entry) => entry?.id === SECOND_ACCOUNT_ID);

const linkSharedEntries = (homeDir, configDir) => {
  for (const name of SHARED_ENTRIES) {
    const source = path.join(homeDir, '.claude', name);
    const target = path.join(configDir, name);
    if (!fs.existsSync(source)) continue;
    try {
      fs.lstatSync(target);
      continue; // Never replace something already there.
    } catch {}
    fs.symlinkSync(source, target);
  }
};

/**
 * Saves the second account. Safe to call again: an existing entry, config dir
 * or link is kept as it is.
 */
export const addSecondClaudeAccount = ({ homeDir = os.homedir(), dataHome = defaultDataHome() } = {}) => {
  const account = { id: SECOND_ACCOUNT_ID, name: SECOND_ACCOUNT_NAME, configDir: secondClaudeConfigDir(homeDir) };
  fs.mkdirSync(account.configDir, { recursive: true, mode: 0o700 });
  linkSharedEntries(homeDir, account.configDir);
  const accounts = readAccounts(dataHome);
  if (!accounts.some((entry) => entry?.id === SECOND_ACCOUNT_ID)) {
    const file = accountsFile(dataHome);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify([...accounts, account], null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  }
  return account;
};

/** Ids of the saved extra accounts, for the UI to know which provider pages can delete one. */
export const listClaudeAccountIds = ({ dataHome = defaultDataHome() } = {}) =>
  readAccounts(dataHome).map((entry) => entry?.id).filter((id) => typeof id === 'string');

const sameOrInside = (parent, child) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Removes an extra account's entry (so its provider goes away) and, only when
 * asked, its config dir (the login, transcripts and usage). The default
 * account is never listed here and `~/.claude` is refused as a target, as is
 * anything that is not a `.claude*` folder directly inside the home directory.
 * Links inside the dir (the settings shared from the default account) are
 * unlinked, never followed.
 */
export const removeClaudeAccount = (id, { deleteLoginData = false, homeDir = os.homedir(), dataHome = defaultDataHome() } = {}) => {
  const accounts = readAccounts(dataHome);
  const entry = accounts.find((candidate) => candidate?.id === id);
  if (!entry) {
    const error = new Error('Unknown Claude account');
    error.code = 'NOT_FOUND';
    throw error;
  }
  let removedLoginData = false;
  if (deleteLoginData && typeof entry.configDir === 'string' && entry.configDir.trim()) {
    const dir = path.resolve(entry.configDir);
    const safe = path.dirname(dir) === path.resolve(homeDir)
      && path.basename(dir).startsWith('.claude')
      && !sameOrInside(dir, path.join(homeDir, '.claude'))
      && !sameOrInside(path.join(homeDir, '.claude'), dir);
    if (!safe) {
      const error = new Error('Refusing to delete this folder');
      error.code = 'UNSAFE_DIR';
      throw error;
    }
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const target = path.join(dir, name);
      if (fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    removedLoginData = true;
  }
  const file = accountsFile(dataHome);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(accounts.filter((candidate) => candidate !== entry), null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return { id, removedLoginData };
};
