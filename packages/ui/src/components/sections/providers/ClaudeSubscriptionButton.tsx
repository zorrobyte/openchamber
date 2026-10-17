import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { addSecondClaudeAccount, fetchSecondClaudeAccount } from '@/lib/claudeAccounts';

interface ClaudeSubscriptionButtonProps {
  /** Runs with the new provider id once its card exists. */
  onAdded: (providerId: string) => void;
}

/**
 * Claude Code's own "Add account" only re-checks the one CLI login, so a
 * second subscription is a separate provider with its own login and usage.
 * Shown until that provider exists.
 */
export const ClaudeSubscriptionButton: React.FC<ClaudeSubscriptionButtonProps> = ({ onAdded }) => {
  const { t } = useI18n();
  const [offered, setOffered] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetchSecondClaudeAccount()
      .then((second) => { if (active) setOffered(second === false); })
      .catch((error) => { console.warn('[providers] could not read Claude subscriptions:', error); });
    return () => { active = false; };
  }, []);

  if (!offered) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const { account, reloaded } = await addSecondClaudeAccount();
      setOffered(false);
      if (reloaded) onAdded(account.id);
      else toast.info(t('settings.providers.claude.restartToShow'));
    } catch (error) {
      console.error('[providers] could not add a Claude subscription:', error);
      toast.error(t('settings.providers.claude.addSubscriptionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="xs" className="!font-normal" disabled={busy} onClick={() => void handleClick()}>
      <Icon name="add" className="size-3.5" />
      {t('settings.providers.claude.addSubscription')}
    </Button>
  );
};
