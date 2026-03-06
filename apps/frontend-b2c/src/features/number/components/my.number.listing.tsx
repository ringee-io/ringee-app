import { columns } from '@/features/number/components/tables/my.number.columns';
import { MyNumberTable } from './tables/my.number.table';
import { apiServer } from '@ringee/frontend-shared/lib/api.server';

export async function MyNumberListing() {
  const numbers = await apiServer.get('/telephony/phone-numbers');

  return (
    <MyNumberTable
      data={numbers}
      totalItems={numbers.length}
      columns={columns}
    />
  );
}
