import { BuyNumberTable } from '@/features/number/components/tables/buy.number.table';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { columns } from '@/features/number/components/tables/buy.number.columns';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';
import {
  NumberLookupRecovery,
  type NumberInventoryLookup
} from './number-lookup-recovery';

export async function BuyNumberListing() {
  const countryCode = searchParamsCache.get('countryCode') || 'US';
  const areaCode = searchParamsCache.get('areaCode') || '';
  const numberType = searchParamsCache.get('numberType') || 'local';
  const features = searchParamsCache.get('features') || [];
  const limit = searchParamsCache.get('perPage') || 50;

  const searchParams = new URLSearchParams();
  searchParams.append('countryCode', countryCode);
  if (areaCode) searchParams.append('areaCode', areaCode);
  if (numberType) searchParams.append('numberType', numberType);
  if (features.length > 0) searchParams.append('features', features.join(','));
  searchParams.append('limit', String(limit));

  // The authenticated lookup keeps a provider failure apart from an empty
  // inventory, so the page can offer the right recovery for each.
  let lookup: NumberInventoryLookup;
  try {
    lookup = await apiServer.get<NumberInventoryLookup>(
      `/telephony/numbers/lookup/${countryCode}?${searchParams.toString()}`
    );
  } catch {
    lookup = { status: 'failed', numbers: [], errorCode: 'request_failed' };
  }
  const totalAvailable = 10000; //availableNumbers.length

  return (
    <div className='flex flex-1 flex-col space-y-4'>
      <BuyNumberTable
        data={lookup.numbers}
        totalItems={totalAvailable}
        columns={columns}
      />
      {lookup.status !== 'results' ? (
        <NumberLookupRecovery
          status={lookup.status}
          countryCode={countryCode}
          numberType={numberType}
          filtersUsed={Boolean(areaCode) || features.length > 0}
        />
      ) : null}
    </div>
  );
}
