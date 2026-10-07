import type { Metadata } from 'next';

import { buildMetadata } from '@/features/marketing/seo';
import { WallOfLoveStage } from '@/features/marketing/components/wall-of-love';

export const metadata: Metadata = buildMetadata({
  title: 'Wall of Love — What People Say About Ringee',
  description:
    'What the teams and freelancers who make their calls with Ringee say about it: real reviews and messages, quoted word for word.',
  path: '/wall-of-love'
});

export default function WallOfLovePage() {
  return <WallOfLoveStage />;
}
