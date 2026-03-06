import {
  createSearchParamsCache,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsJson,
  parseAsStringEnum,
  parseAsArrayOf
} from 'nuqs/server';

export const searchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  gender: parseAsString,
  category: parseAsString,
  sort: parseAsJson<Array<{ id: string; desc: boolean }>>(
    (value): Array<{ id: string; desc: boolean }> | null => {
      if (Array.isArray(value))
        return value as Array<{ id: string; desc: boolean }>;
      return null;
    }
  ).withDefault([]),
  search: parseAsString,
  tab: parseAsString.withDefault(''),
  country: parseAsString.withDefault('US'),
  areaCode: parseAsString,
  countryCode: parseAsString.withDefault('US'),
  numberType: parseAsStringEnum(['local', 'toll_free']).withDefault('local'),
  // Date filters for recordings
  dateFrom: parseAsString,
  dateTo: parseAsString,
  // Tag filtering for contacts
  tags: parseAsArrayOf(parseAsString).withDefault([])
  // advanced filter
  // filters: getFiltersStateParser().withDefault([]),
  // joinOperator: parseAsStringEnum(['and', 'or']).withDefault('and')
};

export const searchParamsCache = createSearchParamsCache(searchParams);
export const serialize = createSerializer(searchParams);
