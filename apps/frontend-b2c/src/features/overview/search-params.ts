import { createSearchParamsCache, parseAsString } from 'nuqs/server';

export const dashboardSearchParams = {
  memberId: parseAsString,
  memberName: parseAsString,
};

export const dashboardParamsCache = createSearchParamsCache(dashboardSearchParams);
