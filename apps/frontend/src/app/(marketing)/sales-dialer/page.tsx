import type { Metadata } from 'next';

import {
  SolutionPage,
  solutionMetadata
} from '@/features/marketing/components/solution-page';
import { requireSolution } from '@/features/marketing/content/solutions';

const solution = requireSolution('sales-dialer');

export const metadata: Metadata = solutionMetadata(solution);

export default function SalesDialerPage() {
  return <SolutionPage solution={solution} />;
}
