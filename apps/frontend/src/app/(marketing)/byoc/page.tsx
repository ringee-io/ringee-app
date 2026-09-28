import type { Metadata } from 'next';

import {
  SolutionPage,
  solutionMetadata
} from '@/features/marketing/components/solution-page';
import { requireSolution } from '@/features/marketing/content/solutions';

const solution = requireSolution('byoc');

export const metadata: Metadata = solutionMetadata(solution);

export default function BringYourOwnCarrierPage() {
  return <SolutionPage solution={solution} />;
}
