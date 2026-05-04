import { BuyNumberTable } from '@/features/number/components/tables/buy.number.table';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { columns } from '@/features/number/components/tables/buy.number.columns';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

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

  const availableNumbers = await apiServer.get(
    `/telephony/numbers/available/${countryCode}?${searchParams.toString()}`
  );
  const totalAvailable = 10000; //availableNumbers.length

  return (
    <BuyNumberTable
      data={availableNumbers}
      totalItems={totalAvailable}
      columns={columns}
    />
  );
}
