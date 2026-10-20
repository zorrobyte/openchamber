import React from 'react';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
import { useI18n } from '@/lib/i18n';
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { getProviderModelDisplayName } from '@/lib/modelDisplay';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { isVSCodeRuntime } from '@/lib/desktop';
import { normalizePath } from '@/lib/pathNormalization';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { buildChildrenIndex, computeSubtreeCost, formatCost } from './subagentCost';
import type { State } from '@/sync/types';
import type { Session } from '@/lib/opencode/model';

type Props = {
  sessionId: string | null;
  directory: string | null;
};

const SECTION_ID = 'subagents';

const SubagentDuration: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const hasDuration = useHasSessionActivityDuration(sessionId, true);
  return hasDuration ? <SessionActivityDuration sessionId={sessionId} running /> : null;
};

/**
 * Running subagents and, more importantly, their blockers: a permission request
 * raised by a child session has no representation in the transcript, so this
 * panel is the only place it becomes visible.
 */
export const WorkStatusSubagentsSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const isMobile = useUIStore((state) => state.isMobile);
  const providers = useConfigStore((state) => state.providers);

  const liveSessions = useAllLiveSessions();
  const statuses = useAllSessionStatuses();
  const childrenByParent = React.useMemo(() => buildChildrenIndex(liveSessions), [liveSessions]);
  // Every descendant, not only direct children: subagents can launch their
  // own, and a blocker raised that deep is otherwise invisible. Depth drives
  // the row's indent. Cycle-guarded like computeSubtreeCost.
  const descendants = React.useMemo(() => {
    const found: Array<{ session: Session; depth: number }> = [];
    if (!sessionId) return found;
    const seen = new Set([sessionId]);
    const walk = (id: string, depth: number) => {
      for (const kid of childrenByParent.get(id) ?? []) {
        if (seen.has(kid.id)) continue;
        seen.add(kid.id);
        found.push({ session: kid, depth });
        walk(kid.id, depth + 1);
      }
    };
    walk(sessionId, 0);
    return found;
  }, [childrenByParent, sessionId]);
  const children = React.useMemo(() => descendants.map((entry) => entry.session), [descendants]);

  // One subscription covers every child: per-session hooks would multiply
  // store subscriptions by the number of subagents.
  const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
  const forms = useDirectorySync(React.useCallback((state: State) => state.form, []));
  const statusReady = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusReady, []),
    directory ?? undefined,
  );
  const statusInvalidated = useDirectorySync(
    React.useCallback((state: State) => state.sessionStatusInvalidated, []),
    directory ?? undefined,
  );
  // Every status event reaches the global store, whichever directory owns the
  // child, so a child seen going busy and then settling is known to be idle
  // even when the directory snapshot does not cover it. The last turn's
  // outcome outlives the live status: a child that went idle after an error
  // reads as failed, not done. Joined to a string so the selector stays
  // stable while nothing about these children changes.
  const observedChildren = useGlobalSessionStatusStore(React.useCallback((state) => children
    .flatMap((child) => {
      if (state.statusById.has(child.id)) return [`${child.id}\tbusy`];
      const observed = state.observedById.get(child.id);
      return observed ? [`${child.id}\t${observed.outcome === 'failed' ? 'failed' : 'settled'}`] : [];
    })
    .join('\n'), [children]));

  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);

  // Subagents appearing where there were none is the one moment this section
  // has something urgent to say, so it opens itself. Only on the empty→present
  // edge: re-expanding on every count change would fight a user who just
  // collapsed it.
  const hadChildren = React.useRef(children.length > 0);
  React.useEffect(() => {
    const present = children.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [children.length, setSectionExpanded]);

  // Same branch the transcript's Task tool takes: surfaces that cannot host an
  // side panel navigate to the child session instead of opening a tab.
  const openChildSession = React.useCallback((childId: string, label: string) => {
    if (!directory) return;
    if (isMobile || isVSCodeRuntime()) {
      setCurrentSession(childId, directory);
      return;
    }
    openContextPanelTab(directory, {
      mode: 'chat',
      dedupeKey: `session:${childId}`,
      label,
      readOnly: true,
    });
  }, [directory, isMobile, openContextPanelTab, setCurrentSession]);

  useReportWorkStatusPresence('subagents', children.length > 0);

  if (children.length === 0) return null;

  const observedById = new Map<string, string>();
  for (const line of observedChildren.split('\n')) {
    const [id, observed] = line.split('\t');
    if (id && observed) observedById.set(id, observed);
  }
  const panelDirectory = normalizePath(directory);
  const sessionsById = new Map(liveSessions.map((session) => [session.id, session]));
  const rows = descendants.map(({ session: child, depth }) => {
    const blocked = (permissions[child.id]?.length ?? 0) > 0;
    const asked = (forms[child.id]?.length ?? 0) > 0;
    const status = statuses[child.id]?.type;
    const observed = observedById.get(child.id);
    const busy = status === 'busy' || status === 'retry' || (!status && observed === 'busy');
    const failed = !busy && observed === 'failed';
    // The snapshot only speaks for its own directory. Paths are compared
    // normalized: OpenCode may report a child's directory with a trailing
    // slash or Windows separators the panel's directory does not have.
    const snapshotCovers = statusReady === true && !statusInvalidated?.[child.id]
      && panelDirectory !== null && normalizePath(child.directory) === panelDirectory;
    const done = !failed && !busy && (status === 'idle' || (!status && (snapshotCovers || observed === 'settled')));
    const finished = !blocked && !asked && (done || failed);
    // Blockers first, then running rows, then rows whose status is not known
    // yet, then finished ones: an unknown row must not push a working one down.
    const rank = blocked || asked ? 0 : busy ? 1 : finished ? 3 : 2;
    // Each row's cost is its own subtree, so a nested subagent's spend also
    // rolls up into every row above it.
    const cost = computeSubtreeCost(child.id, sessionsById, childrenByParent);
    return { child, depth, blocked, asked, busy, failed, done, rank, cost };
  });
  type Row = (typeof rows)[number];
  const rowById = new Map(rows.map((row) => [row.child.id, row]));
  // A branch sorts by its most urgent row, so a blocked grandchild lifts its
  // parent instead of hiding under a finished one.
  const branchRank = new Map<string, number>();
  const rankOf = (row: Row): number => {
    const known = branchRank.get(row.child.id);
    if (known !== undefined) return known;
    branchRank.set(row.child.id, row.rank);
    const kids = (childrenByParent.get(row.child.id) ?? []).flatMap((kid) => rowById.get(kid.id) ?? []);
    const rank = Math.min(row.rank, ...kids.map(rankOf));
    branchRank.set(row.child.id, rank);
    return rank;
  };
  // Newest first by creation within each rank, never by last activity: an
  // activity order reshuffled the rows on every step, moving them under the
  // pointer. A fully finished list reads exactly as it did at launch. Each
  // row's own subagents follow it directly, sorted the same way.
  const ordered: Row[] = [];
  const place = (parentId: string) => {
    const kids = (childrenByParent.get(parentId) ?? [])
      .flatMap((kid) => rowById.get(kid.id) ?? [])
      .sort((left, right) => (rankOf(left) - rankOf(right))
        || ((right.child.time?.created ?? 0) - (left.child.time?.created ?? 0)));
    for (const kid of kids) {
      rowById.delete(kid.child.id);
      ordered.push(kid);
      place(kid.child.id);
    }
  };
  if (sessionId) place(sessionId);

  const busyChildren = rows.filter((row) => row.busy).length;

  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={busyChildren > 0 ? `${busyChildren}/${children.length}` : children.length}
    >
      <div className="max-h-56 overflow-y-auto">
        {ordered.map(({ child, depth, blocked, asked, busy, failed, done, cost: childCost }) => {
          const label = child.title?.trim() || t('chat.workStatus.subagent.untitled');
          let icon: IconName = 'time';
          let iconColor: string | undefined;
          let statusLabel = '';
          if (blocked || asked) {
            icon = 'alert';
            iconColor = 'var(--status-warning)';
            statusLabel = t(blocked ? 'chat.workStatus.subagent.needsPermission' : 'chat.workStatus.subagent.askedQuestion');
          } else if (busy) {
            icon = 'record-circle';
            iconColor = 'var(--status-info)';
            statusLabel = t('chat.workStatus.subagent.working');
          } else if (failed) {
            icon = 'close-circle';
            iconColor = 'var(--status-error)';
            statusLabel = t('chat.workStatus.subagent.failed');
          } else if (done) {
            icon = 'checkbox-circle';
            iconColor = 'var(--status-success)';
            statusLabel = t('chat.workStatus.subagent.done');
          }
          const modelName = getProviderModelDisplayName(
            providers.find((provider) => provider.id === child.model?.providerID),
            child.model?.id,
          );
          return (
            <WorkStatusRow
              key={child.id}
              onClick={directory ? () => openChildSession(child.id, label) : undefined}
              ariaLabel={[t('chat.workStatus.action.openSubagent', { name: label }), statusLabel].filter(Boolean).join('. ')}
              // The smaller status glyph sits centred in the panel's 16px icon
              // slot, so it lines up under the section icon and the label
              // starts where every other row's does.
              leading={(
                <span
                  className="flex size-4 shrink-0 items-center justify-center"
                  style={depth > 0 ? { marginInlineStart: depth * 12 } : undefined}
                >
                  <Icon name={icon} className="size-3.5" style={iconColor ? { color: iconColor } : undefined} />
                </span>
              )}
              label={label}
              tooltip={modelName || undefined}
              value={(
                <>
                  {blocked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.needsPermission')}</WorkStatusValue>
                  ) : asked ? (
                    <WorkStatusValue tone="warning">{t('chat.workStatus.subagent.askedQuestion')}</WorkStatusValue>
                  ) : busy ? <SubagentDuration sessionId={child.id} /> : null}
                  {childCost > 0 ? <WorkStatusValue tone="muted">{formatCost(childCost)}</WorkStatusValue> : null}
                </>
              )}
            />
          );
        })}
      </div>
    </WorkStatusCollapsibleSection>
  );
};
