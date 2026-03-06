import { BuyNumberTable } from '@/features/number/components/tables/buy.number.table';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';
import { columns } from '@/features/number/components/tables/buy.number.columns';
import { searchParamsCache } from '@ringee/frontend-shared/lib/searchparams';

export async function BuyNumberListing() {
  const countryCode = searchParamsCache.get('countryCode') || 'US';
  const areaCode = searchParamsCache.get('areaCode') || '';
  const numberType = searchParamsCache.get('numberType') || 'local';
  const limit = searchParamsCache.get('perPage') || 50;

  const params = {
    countryCode,
    areaCode,
    numberType,
    limit
  };

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, value.toString());
  });

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
