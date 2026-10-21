import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addSecondClaudeAccount, hasSecondClaudeAccount, listClaudeAccountIds, removeClaudeAccount } from './accounts.js';

let root;
let homeDir;
let dataHome;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-accounts-'));
  homeDir = path.join(root, 'home');
  dataHome = path.join(root, 'data');
  fs.mkdirSync(path.join(homeDir, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(homeDir, '.claude', 'CLAUDE.md'), '# rules\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const savedAccounts = () =>
  JSON.parse(fs.readFileSync(path.join(dataHome, 'opencode-claude', 'accounts.json'), 'utf8'));

describe('second Claude account', () => {
  it('saves the account the plugin reads and links the shared settings in', () => {
    expect(hasSecondClaudeAccount({ dataHome })).toBe(false);

    const account = addSecondClaudeAccount({ homeDir, dataHome });

    expect(account).toEqual({ id: 'claude-code-2', name: 'Claude Code (2)', configDir: path.join(homeDir, '.claude-2') });
    expect(savedAccounts()).toEqual([account]);
    expect(hasSecondClaudeAccount({ dataHome })).toBe(true);
    expect(fs.readlinkSync(path.join(account.configDir, 'CLAUDE.md'))).toBe(path.join(homeDir, '.claude', 'CLAUDE.md'));
    expect(fs.readlinkSync(path.join(account.configDir, 'skills'))).toBe(path.join(homeDir, '.claude', 'skills'));
    // Missing in the default account: nothing to link.
    expect(fs.existsSync(path.join(account.configDir, 'settings.json'))).toBe(false);
  });

  it('keeps other saved accounts and what the config dir already holds', () => {
    const file = path.join(dataHome, 'opencode-claude', 'accounts.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const other = { id: 'claude-code-9', name: 'Other', configDir: '/elsewhere' };
    fs.writeFileSync(file, JSON.stringify([other]));
    const configDir = path.join(homeDir, '.claude-2');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'CLAUDE.md'), 'own rules');

    addSecondClaudeAccount({ homeDir, dataHome });
    addSecondClaudeAccount({ homeDir, dataHome });

    expect(savedAccounts().map((entry) => entry.id)).toEqual(['claude-code-9', 'claude-code-2']);
    expect(fs.readFileSync(path.join(configDir, 'CLAUDE.md'), 'utf8')).toBe('own rules');
  });

  it('treats an unreadable accounts file as no accounts', () => {
    const file = path.join(dataHome, 'opencode-claude', 'accounts.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');

    expect(hasSecondClaudeAccount({ dataHome })).toBe(false);
  });
});

describe('removing a Claude account', () => {
  it('drops the entry and keeps the login data unless asked', () => {
    const account = addSecondClaudeAccount({ homeDir, dataHome });
    fs.writeFileSync(path.join(account.configDir, '.credentials.json'), '{}');
    expect(listClaudeAccountIds({ dataHome })).toEqual(['claude-code-2']);
    expect(removeClaudeAccount('claude-code-2', { homeDir, dataHome })).toEqual({ id: 'claude-code-2', removedLoginData: false });
    expect(savedAccounts()).toEqual([]);
    expect(fs.existsSync(path.join(account.configDir, '.credentials.json'))).toBe(true);
  });

  it('deletes the config dir on request without following links into ~/.claude', () => {
    const account = addSecondClaudeAccount({ homeDir, dataHome });
    removeClaudeAccount('claude-code-2', { deleteLoginData: true, homeDir, dataHome });
    expect(fs.existsSync(account.configDir)).toBe(false);
    expect(fs.readFileSync(path.join(homeDir, '.claude', 'CLAUDE.md'), 'utf8')).toBe('# rules\n');
    expect(savedAccounts()).toEqual([]);
  });

  it('refuses unknown ids and folders that are not an extra .claude dir', () => {
    expect(() => removeClaudeAccount('claude-code', { homeDir, dataHome })).toThrow('Unknown');
    for (const configDir of [path.join(homeDir, '.claude'), homeDir, path.join(root, 'elsewhere')]) {
      fs.mkdirSync(path.join(dataHome, 'opencode-claude'), { recursive: true });
      fs.writeFileSync(path.join(dataHome, 'opencode-claude', 'accounts.json'), JSON.stringify([{ id: 'claude-code-2', name: 'x', configDir }]));
      expect(() => removeClaudeAccount('claude-code-2', { deleteLoginData: true, homeDir, dataHome })).toThrow('Refusing');
      expect(fs.existsSync(path.join(homeDir, '.claude', 'CLAUDE.md'))).toBe(true);
    }
  });
});
