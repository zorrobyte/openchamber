import React from 'react';
import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

const identitiesSchema = z.object({ identities: z.record(z.string(), z.string().min(1)) });

export type ProviderIdentities = Readonly<Record<string, string>>;

const NONE: ProviderIdentities = Object.freeze({});

/**
 * Provider id to the account (an email) it is signed in as, for the providers
 * where one is known. Empty where the runtime has no OpenChamber server, and
 * on any failure: an identity is a nicety, never worth an error.
 */
export const fetchProviderIdentities = async (): Promise<ProviderIdentities> => {
  try {
    const response = await runtimeFetch('/api/quota/account-identities');
    if (!response.ok) return NONE;
    return identitiesSchema.parse(await response.json()).identities;
  } catch {
    return NONE;
  }
};

/** Loads the identities once per mount; `refreshKey` re-reads them (after a sign-in, say). */
export const useProviderIdentities = (refreshKey?: unknown): ProviderIdentities => {
  const [identities, setIdentities] = React.useState<ProviderIdentities>(NONE);
  React.useEffect(() => {
    let active = true;
    void fetchProviderIdentities().then((next) => { if (active) setIdentities(next); });
    return () => { active = false; };
  }, [refreshKey]);
  return identities;
};
