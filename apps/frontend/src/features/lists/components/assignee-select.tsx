'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { useOrgMembers } from '@ringee/frontend-shared/hooks/use-org-members';
import type { ContactListPerson } from '../types';
import { usePersonName } from './list-bits';

/**
 * Picks the member who works a list. Admin-only: the server refuses anyone
 * else's pick (LIST-002). With no `value` it shows the signed-in user, the
 * server's default too.
 */
export function AssigneeSelect({
  value,
  current,
  onChange,
  disabled,
  className,
  id
}: {
  value: string | null;
  /** Who the list is assigned to now, kept selectable if they left the org. */
  current?: ContactListPerson | null;
  onChange: (memberId: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const t = useTranslations('lists');
  const nameOf = usePersonName();
  const { members, isLoaded } = useOrgMembers();
  const me = members.find((member) => member.isCurrentUser);
  const selected = value ?? me?.id ?? '';
  const missing =
    current && !members.some((member) => member.id === current.id)
      ? current
      : null;

  return (
    <Select
      value={selected}
      onValueChange={onChange}
      disabled={disabled || !isLoaded}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.isCurrentUser
              ? `${member.name ?? t('you')} (${t('you')})`
              : (member.name ?? t('formerMember'))}
          </SelectItem>
        ))}
        {missing ? (
          <SelectItem value={missing.id} disabled>
            {nameOf(missing)}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}
