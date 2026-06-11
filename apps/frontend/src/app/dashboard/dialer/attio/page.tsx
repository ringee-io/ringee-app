import { AttioDialer } from '@/features/integrations/components/attio-dialer';

export const metadata = {
  title: 'Attio Call | Ringee',
  description: 'Make a call from your Attio CRM integration.'
};

export default function AttioDialerPage() {
  return <AttioDialer />;
}
