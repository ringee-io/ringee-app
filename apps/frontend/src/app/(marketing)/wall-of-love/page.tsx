import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { WallOfLoveStage } from '@/features/marketing/components/wall-of-love';

export const metadata: Metadata = buildMetadata({
  title: 'Wall of Love — What People Say About Ringee',
  description:
    'Real LinkedIn posts, WhatsApp messages, Trustpilot reviews and videos from the teams and freelancers who make their calls with Ringee.',
  path: '/wall-of-love'
});

export default function WallOfLovePage() {
  return <WallOfLoveStage />;
}
