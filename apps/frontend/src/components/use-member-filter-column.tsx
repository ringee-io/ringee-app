'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Option } from '@ringee/frontend-shared/types/data-table';
import { useOrganization } from '@clerk/nextjs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { useTranslations } from 'next-intl';

/**
 * Builds an admin-only "Member" faceted-filter column (id `memberId`) for the
 * shared data tables (history, recordings), matching the buy-number country
 * filter pattern. The column is filter-only (hidden) — selecting an option
 * writes `?memberId=<dbUserId>` to the URL, which the server listing reads.
 *
 * Returns `{ column: null }` for non-admins (members/freelancers see only their
 * own data, enforced server-side).
 */
export function useMemberFilterColumn<TData>(): {
  column: ColumnDef<TData> | null;
  options: Option[];
} {
  const { isOrgAdmin } = useOrgRole();
  const { organization } = useOrganization();
  const api = useApi();
  const t = useTranslations('common.memberFilter');
  const [options, setOptions] = React.useState<Option[]>([]);

  React.useEffect(() => {
    if (!isOrgAdmin || !organization) {
      setOptions([]);
      return;
    }
    let active = true;
    organization.getMemberships().then(async (res) => {
      const clerkIds = res.data
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean) as string[];
      if (clerkIds.length === 0) {
        if (active) setOptions([]);
        return;
      }
      const map = await api.get<{ clerkId: string; id: string }[]>(
        `/user/by-clerk-ids?ids=${clerkIds.join(',')}`
      );
      if (!active) return;
      const lookup = new Map(map.map((u) => [u.clerkId, u.id]));
      setOptions(
        res.data
          .map((m) => {
            const clerkId = m.publicUserData?.userId || '';
            const label =
              `${m.publicUserData?.firstName || ''} ${
                m.publicUserData?.lastName || ''
              }`.trim() ||
              m.publicUserData?.identifier ||
              t('member');
            return { label, value: lookup.get(clerkId) || '' };
          })
          // Drop members whose DB user couldn't be resolved.
          .filter((o) => o.value)
      );
    });
    return () => {
      active = false;
    };
  }, [isOrgAdmin, organization, api, t]);

  const column = React.useMemo<ColumnDef<TData> | null>(() => {
    if (!isOrgAdmin) return null;
    return {
      id: 'memberId',
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: () => null,
      meta: {
        label: t('member'),
        placeholder: t('all'),
        variant: 'select',
        options
      }
    };
  }, [isOrgAdmin, options, t]);

  return { column, options };
}
