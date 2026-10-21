import express from 'express';
import { ENTERPRISE_MODE_ERROR, isEnterpriseMode } from '../enterprise-mode.js';
import { readProviderIdentities } from './identities.js';
import { addSecondClaudeAccount, hasSecondClaudeAccount, listClaudeAccountIds, removeClaudeAccount } from './providers/claude/accounts.js';
import { deleteManagedCredential, getManagedCredentialStatus, normalizers, readManagedCredential, writeManagedCredential } from './credentials/providers.js';
import { importCursorCredential, validateCursorCredential } from './providers/cursor.js';
import { fetchExeDevUsage } from './providers/exe-dev.js';
import { aliases as zaiAliases, giftResetTypes as zaiGiftResetTypes, useZaiGiftReset } from './providers/zai.js';
import { fetchQuota as fetchZenmuxQuota } from './providers/zenmux.js';

// Keyed by the same provider ids as `normalizers`: a provider with a normalizer
// but no validator would be stored without ever being checked.
const validators = {
  'exe-dev': fetchExeDevUsage,
  cursor: validateCursorCredential,
  zenmux: async (credential) => {
    const result = await fetchZenmuxQuota({ readCredential: () => credential });
    if (!result.ok) throw new Error(result.error ?? 'Credential validation failed');
  },
};

const getProvider = (req, res) => {
  const providerId = req.params.providerId;
  if (!normalizers[providerId]) {
    res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported credential provider' });
    return null;
  }
  return providerId;
};

const credentialError = (res, error) => res.status(400).json({
  code: 'INVALID_CREDENTIAL',
  error: error instanceof Error ? error.message : 'Credential validation failed',
});

export function registerQuotaRoutes(app, { getQuotaProviders, reloadOpenCodePlugins }) {
  // Which account each provider is signed in as: provider id to email.
  app.get('/api/quota/account-identities', (_req, res) => {
    try {
      res.json({ identities: readProviderIdentities() });
    } catch (error) {
      console.warn('Could not read provider account identities:', error instanceof Error ? error.message : error);
      res.json({ identities: {} });
    }
  });

  app.get('/api/quota/claude-accounts', (_req, res) => {
    res.json({ second: hasSecondClaudeAccount(), accounts: listClaudeAccountIds() });
  });

  // A new provider: refused in enterprise mode like every other provider entry.
  app.post('/api/quota/claude-accounts', async (_req, res) => {
    if (isEnterpriseMode()) {
      return res.status(403).json({ error: ENTERPRISE_MODE_ERROR, code: 'enterprise_mode' });
    }
    let account;
    try {
      account = addSecondClaudeAccount();
    } catch (error) {
      console.error('Failed to add a Claude account:', error);
      return res.status(500).json({ error: 'Could not add the Claude account' });
    }
    // The account is saved either way; without a reload it appears on OpenCode's next start.
    let reloaded = true;
    try {
      await reloadOpenCodePlugins();
    } catch (error) {
      console.warn('OpenCode did not reload after adding a Claude account:', error);
      reloaded = false;
    }
    res.json({ account: { id: account.id, name: account.name }, reloaded });
  });

  // Deleting is explicit: the provider entry always goes, the login data only on request.
  app.delete('/api/quota/claude-accounts/:id', express.json({ limit: '1kb' }), async (req, res) => {
    let removed;
    try {
      removed = removeClaudeAccount(req.params.id, { deleteLoginData: req.body?.deleteLoginData === true });
    } catch (error) {
      if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: 'Unknown Claude account' });
      console.error('Failed to remove a Claude account:', error);
      return res.status(500).json({ error: error?.code === 'UNSAFE_DIR' ? error.message : 'Could not remove the Claude account' });
    }
    let reloaded = true;
    try {
      await reloadOpenCodePlugins();
    } catch (error) {
      console.warn('OpenCode did not reload after removing a Claude account:', error);
      reloaded = false;
    }
    res.json({ ...removed, reloaded });
  });

  app.get('/api/quota/providers', async (_req, res) => {
    try {
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      res.json({ providers: await listConfiguredQuotaProviders() });
    } catch (error) {
      console.error('Failed to list quota providers:', error);
      res.status(500).json({ error: error.message || 'Failed to list quota providers' });
    }
  });

  app.get('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (providerId) res.json(getManagedCredentialStatus(providerId));
  });

  app.put('/api/quota/credentials/:providerId', express.json({ limit: '16kb' }), async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = normalizers[providerId](req.body);
    if (!credential) return credentialError(res, new Error('Invalid credential'));
    try {
      await validators[providerId](credential);
      res.json(writeManagedCredential(providerId, credential));
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/validate', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    const credential = readManagedCredential(providerId);
    if (!credential) return res.status(404).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
    try {
      await validators[providerId](credential);
      res.json({ valid: true });
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.post('/api/quota/credentials/:providerId/import', async (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    if (providerId !== 'cursor') return res.status(404).json({ code: 'IMPORT_UNAVAILABLE', error: 'Import unavailable' });
    try {
      res.json(await importCursorCredential());
    } catch (error) {
      credentialError(res, error);
    }
  });

  app.delete('/api/quota/credentials/:providerId', (req, res) => {
    const providerId = getProvider(req, res);
    if (!providerId) return;
    deleteManagedCredential(providerId);
    res.json({ configured: false });
  });

  app.get('/api/quota/:providerId', async (req, res) => {
    try {
      const { providerId } = req.params;
      if (!providerId) return res.status(400).json({ error: 'Provider ID is required' });
      const { fetchQuotaForProvider } = await getQuotaProviders();
      res.json(await fetchQuotaForProvider(providerId));
    } catch (error) {
      console.error('Failed to fetch quota:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch quota' });
    }
  });

  app.post('/api/quota/:providerId/gift-reset/use', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const providerId = req.params.providerId;
      if (!zaiAliases.includes(providerId)) {
        return res.status(404).json({ code: 'UNSUPPORTED_PROVIDER', error: 'Unsupported quota provider' });
      }
      const { recordId, resetType } = req.body ?? {};
      if (!Number.isFinite(recordId) || !zaiGiftResetTypes.includes(resetType)) {
        return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Invalid gift reset request' });
      }
      await useZaiGiftReset({ recordId, resetType });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Not configured') {
        return res.status(400).json({ code: 'NOT_CONFIGURED', error: 'Not configured' });
      }
      console.error('Failed to activate gift reset:', error);
      res.status(502).json({ error: message || 'Failed to activate gift reset' });
    }
  });
}
