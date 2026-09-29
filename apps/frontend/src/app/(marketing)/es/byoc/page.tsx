import {
  SolutionPage,
  solutionMetadata
} from '@/features/marketing/components/solution-page';
import { requireEsSolution } from '@/features/marketing/content/es/solutions';
const solution = requireEsSolution('byoc');
export const metadata = solutionMetadata(solution);
export default function Page() {
  return <SolutionPage solution={solution} locale='es' />;
}
