export interface ApiAlertLike {
  _id: string;
  acknowledged_at?: number;
}

/**
 * Pick the alert to show: the first unacknowledged alert that has not been
 * dismissed for this session. A NEW alert always surfaces even when an older
 * one was session-dismissed, while dismissed ones stay hidden until they are
 * acknowledged elsewhere or the page reloads.
 */
export function selectVisibleAlert<T extends ApiAlertLike>(
  alerts: T[] | undefined,
  dismissedIds: ReadonlySet<string>,
): T | null {
  return (
    (alerts ?? []).find(
      (a) => a.acknowledged_at === undefined && !dismissedIds.has(a._id),
    ) ?? null
  );
}
