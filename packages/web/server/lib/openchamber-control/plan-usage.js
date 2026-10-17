/**
 * Plan usage for agents: the providers and limits the Usage panel shows, one row per limit.
 * @module openchamber-control/plan-usage
 */

const toLimit = (name, window) => {
  const row = {
    limit: name,
    usedPercent: window?.usedPercent ?? null,
    resetsAt: Number.isFinite(window?.resetAt) ? new Date(window.resetAt).toISOString() : null
  };
  if (window?.valueLabel) row.value = window.valueLabel;
  return row;
};

export const toAgentUsage = (result) => {
  const usage = result?.usage ?? {};
  const limits = [
    ...Object.entries(usage.windows ?? {}).map(([label, window]) => toLimit(label, window)),
    ...Object.entries(usage.models ?? {}).flatMap(([model, entry]) =>
      Object.entries(entry?.windows ?? {}).map(([label, window]) => toLimit(`${model} ${label}`, window))
    )
  ];
  const entry = { provider: result?.providerName ?? result?.providerId };
  if (result?.planLabel) entry.plan = result.planLabel;
  if (result?.ok) entry.limits = limits;
  else entry.error = result?.error ?? 'No usage reported';
  return entry;
};

// One provider failing must not hide the others, so each fetch settles on its own.
export const createPlanUsage = ({ listProviders, fetchQuota }) => async () => {
  const providerIds = await listProviders();
  const results = await Promise.all(
    providerIds.map((providerId) =>
      fetchQuota(providerId).catch((error) => ({ providerId, ok: false, error: String(error?.message ?? error) }))
    )
  );
  return { providers: results.map(toAgentUsage) };
};
