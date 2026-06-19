import { PhoneOutgoing, ShieldAlert, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Presentation-only metadata for each AI pipeline. The human-facing copy
 * (summary, how it works, benefits…) lives in the `ai` i18n namespace under
 * `pipelines.<type>` and `pipelineIntro.*`, so it is translated like the rest
 * of the app. Icons can't live in JSON, so they are mapped here by the stable
 * pipeline `type` returned by `/ai-pipeline`.
 */
export const PIPELINE_ICONS: Record<string, LucideIcon> = {
  follow_up_recommendations: PhoneOutgoing,
  objection_intelligence: ShieldAlert
};

/** Icon for a pipeline, falling back to a generic AI icon for new types. */
export function getPipelineIcon(type: string): LucideIcon {
  return PIPELINE_ICONS[type] ?? Sparkles;
}

/** True when we ship translated intro copy for this pipeline type. */
export function hasPipelineContent(type: string): boolean {
  return type in PIPELINE_ICONS;
}

/** Shape of the translated content read from `t.raw('pipelines.<type>')`. */
export interface PipelineStep {
  title: string;
  description: string;
}

export interface PipelineContent {
  tagline: string;
  summary: string;
  howItWorks: PipelineStep[];
  benefits: string[];
  bestFor: string;
  dataNote: string;
}
