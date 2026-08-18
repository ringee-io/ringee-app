import { OfferDetail } from '@/features/backoffice/components/offer-detail';

export default async function BackofficeOfferDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OfferDetail offerId={id} />;
}
