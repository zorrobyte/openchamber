import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

const statusSchema = z.object({ second: z.boolean(), accounts: z.array(z.string()).optional() });
const addedSchema = z.object({
  account: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  reloaded: z.boolean(),
});
const errorSchema = z.object({ error: z.string().min(1) });

/**
 * Whether the second Claude subscription (its own `claude-code-2` provider)
 * exists. Null where the runtime has no OpenChamber server to ask (VS Code):
 * the feature is not offered there.
 */
export const fetchSecondClaudeAccount = async (): Promise<boolean | null> => {
  const response = await runtimeFetch('/api/quota/claude-accounts');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read Claude subscriptions (${response.status})`);
  return statusSchema.parse(await response.json()).second;
};

/** Adds the second subscription; `reloaded` is false when OpenCode shows it only after a restart. */
export const addSecondClaudeAccount = async (): Promise<z.infer<typeof addedSchema>> => {
  const response = await runtimeFetch('/api/quota/claude-accounts', { method: 'POST' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorSchema.safeParse(payload);
    throw new Error(failure.success ? failure.data.error : `Could not add the Claude subscription (${response.status})`);
  }
  return addedSchema.parse(payload);
};

/** Provider ids of the extra Claude subscriptions that can be deleted; empty where there is no server. */
export const fetchExtraClaudeAccountIds = async (): Promise<readonly string[]> => {
  try {
    const response = await runtimeFetch('/api/quota/claude-accounts');
    if (!response.ok) return [];
    return statusSchema.parse(await response.json()).accounts ?? [];
  } catch {
    return [];
  }
};

/**
 * Deletes an extra Claude subscription's provider. The login data (its config
 * dir) goes only with `deleteLoginData`; the default account is not deletable.
 */
export const deleteClaudeAccount = async (id: string, deleteLoginData: boolean): Promise<void> => {
  const response = await runtimeFetch(`/api/quota/claude-accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleteLoginData }),
  });
  if (response.ok) return;
  const payload: unknown = await response.json().catch(() => null);
  const failure = errorSchema.safeParse(payload);
  throw new Error(failure.success ? failure.data.error : `Could not delete the Claude subscription (${response.status})`);
};
