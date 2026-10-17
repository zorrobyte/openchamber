import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

const statusSchema = z.object({ second: z.boolean() });
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
