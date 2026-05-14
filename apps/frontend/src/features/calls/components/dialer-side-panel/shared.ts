export interface CallbackEntry {
  id: string;
  userId: string;
  organizationId: string | null;
  contactId: string;
  callId: string | null;
  campaignLeadId: string | null;
  scheduledAt: string;
  note: string | null;
  status: string;
  completedAt: string | null;
  contact: {
    id: string;
    name: string | null;
    phoneNumber: string;
    company: string | null;
  };
  campaignLead: {
    id: string;
    campaignId: string;
    campaign: { id: string; name: string };
  } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  } | null;
}

export function formatUserName(
  user:
    | { firstName: string | null; lastName: string | null }
    | null
    | undefined,
  unknownLabel = 'Unknown'
): string {
  if (!user) return unknownLabel;
  const parts = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return parts || unknownLabel;
}

export const CALLBACK_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  due: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  in_progress:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
  completed:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  missed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300'
};

export function getInitials(name: string | null, phoneNumber: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return phoneNumber.replace(/\D/g, '').slice(-2) || '··';
}

export type RelativeT = (
  key:
    | 'now'
    | 'inMinutes'
    | 'minutesAgo'
    | 'inHours'
    | 'hoursAgo'
    | 'tomorrowAt',
  vars?: Record<string, string | number>
) => string;

export function formatRelativeShort(
  date: Date,
  t: RelativeT,
  now: Date = new Date()
): string {
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  const absMin = Math.abs(diffMin);

  if (absMin < 1) return t('now');
  if (absMin < 60) {
    return diffMin > 0
      ? t('inMinutes', { count: absMin })
      : t('minutesAgo', { count: absMin });
  }

  const diffHours = Math.round(absMin / 60);
  if (diffHours < 24) {
    return diffMin > 0
      ? t('inHours', { count: diffHours })
      : t('hoursAgo', { count: diffHours });
  }

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  ) {
    return t('tomorrowAt', {
      time: date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    });
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function isToday(dateStr: string, now: Date = new Date()): boolean {
  const d = new Date(dateStr);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
