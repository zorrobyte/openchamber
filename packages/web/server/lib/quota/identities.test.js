import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readClaudeEmail, readMuseEmail, readProviderIdentities } from './identities.js';

let root;
let homeDir;
let dataHome;

const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'identities-'));
  homeDir = path.join(root, 'home');
  dataHome = path.join(root, 'data');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('provider identities', () => {
  it('reads the default Claude account from ~/.claude.json and extra ones from their config dir', () => {
    write(path.join(homeDir, '.claude.json'), { oauthAccount: { emailAddress: 'one@example.com' } });
    const second = path.join(homeDir, '.claude-2');
    write(path.join(second, '.claude.json'), { oauthAccount: { emailAddress: 'two@example.com' } });
    write(path.join(dataHome, 'opencode-claude', 'accounts.json'), [
      { id: 'claude-code-2', name: 'Claude Code (2)', configDir: second },
    ]);

    expect(readProviderIdentities({ homeDir, dataHome, env: {} })).toEqual({
      'claude-code': 'one@example.com',
      'claude-code-2': 'two@example.com',
    });
  });

  it('honours CLAUDE_CONFIG_DIR for the default account', () => {
    const custom = path.join(root, 'custom');
    write(path.join(custom, '.claude.json'), { oauthAccount: { emailAddress: 'c@example.com' } });
    expect(readProviderIdentities({ homeDir, dataHome, env: { CLAUDE_CONFIG_DIR: custom } })).toEqual({ 'claude-code': 'c@example.com' });
  });

  it('reads the Muse email and never returns tokens', () => {
    write(path.join(homeDir, '.config', 'muse', 'auth.json'), {
      providers: { meta: { access_token: 'SECRET', api_key: 'SECRET', user_email: 'm@example.com' } },
    });
    const identities = readProviderIdentities({ homeDir, dataHome, env: {} });
    expect(identities).toEqual({ 'muse-code': 'm@example.com' });
    expect(JSON.stringify(identities)).not.toContain('SECRET');
    expect(readMuseEmail({ homeDir })).toBe('m@example.com');
  });

  it('skips missing, malformed and non-email values without throwing', () => {
    write(path.join(homeDir, '.claude.json'), '{not json');
    write(path.join(dataHome, 'opencode-claude', 'accounts.json'), [{ id: 'x' }, null, { id: 'y', configDir: path.join(root, 'none') }]);
    write(path.join(homeDir, '.config', 'muse', 'auth.json'), { providers: { meta: { user_email: 'nope' } } });
    expect(readProviderIdentities({ homeDir, dataHome, env: {} })).toEqual({});
    expect(readClaudeEmail(path.join(root, 'absent'), { homeDir })).toBeNull();
  });
});
