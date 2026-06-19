import { notFound } from 'next/navigation';
import { AccountDetail } from '@/features/backoffice/components/account-detail';

export default async function BackofficeAccountDetailPage({
  params
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  if (type !== 'user' && type !== 'org') notFound();
  return <AccountDetail type={type} id={id} />;
}
