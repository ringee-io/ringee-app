export type ObjectionResolution = "handled" | "killed" | "unclear";

/** One semantic objection extracted from a call's complete transcript. */
export interface SemanticObjection {
  /** Dynamic, language-independent identity shared across semantically equal objections. */
  clusterKey: string;
  /** AI-authored display label; no fixed taxonomy is imposed. */
  label: string;
  underlyingConcern: string;
  /** Verbatim evidence in the transcript's original language. */
  evidenceExcerpt: string;
  /** Relevant seller response, when present. */
  sellerResponseExcerpt?: string;
  resolution: ObjectionResolution;
  confidence: number;
}

/** Parse only validated shapes written by the extraction service. */
export function parseSemanticObjections(value: unknown): SemanticObjection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const clusterKey = clampString(item.clusterKey, 80);
    const label = clampString(item.label, 120);
    const evidenceExcerpt = clampString(item.evidenceExcerpt, 600);
    if (!clusterKey || !label || !evidenceExcerpt) return [];
    const resolution = isObjectionResolution(item.resolution)
      ? item.resolution
      : "unclear";
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : 0;
    return [
      {
        clusterKey,
        label,
        underlyingConcern: clampString(item.underlyingConcern, 500),
        evidenceExcerpt,
        sellerResponseExcerpt:
          clampString(item.sellerResponseExcerpt, 600) || undefined,
        resolution,
        confidence,
      },
    ];
  });
}

export function dynamicClusterKey(value: string): string {
  const ascii = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  // Labels written entirely in non-Latin scripts still need a stable key.
  return ascii || `objection_${stableHash(value)}`;
}

export function isObjectionResolution(
  value: unknown,
): value is ObjectionResolution {
  return value === "handled" || value === "killed" || value === "unclear";
}

/** Validate provider output and require every evidence quote to exist in-call. */
export function validateSemanticObjections(
  raw: unknown,
  catalog: Map<string, string>,
  transcript: string,
): SemanticObjection[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = (raw as { objections?: unknown }).objections;
  if (!Array.isArray(entries)) return [];

  const byCluster = new Map<string, SemanticObjection>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const requestedKey = clampString(item.clusterKey, 80);
    const proposedLabel = clampString(item.label, 120);
    const evidenceExcerpt = clampString(item.evidenceExcerpt, 600);
    if (!proposedLabel || !evidenceExcerpt) continue;
    if (!containsExcerpt(transcript, evidenceExcerpt)) continue;

    const existingKey = catalog.has(requestedKey) ? requestedKey : "";
    const clusterKey = existingKey || dynamicClusterKey(proposedLabel);
    if (!clusterKey) continue;
    const label = catalog.get(clusterKey) ?? proposedLabel;
    const resolution = isObjectionResolution(item.resolution)
      ? item.resolution
      : "unclear";
    const confidence =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.min(1, Math.max(0, item.confidence))
        : 0;
    const sellerResponseExcerpt = clampString(item.sellerResponseExcerpt, 600);
    const objection: SemanticObjection = {
      clusterKey,
      label,
      underlyingConcern: clampString(item.underlyingConcern, 500),
      evidenceExcerpt,
      sellerResponseExcerpt:
        sellerResponseExcerpt &&
        containsExcerpt(transcript, sellerResponseExcerpt)
          ? sellerResponseExcerpt
          : undefined,
      resolution,
      confidence,
    };
    const previous = byCluster.get(clusterKey);
    if (!previous || objection.confidence > previous.confidence) {
      byCluster.set(clusterKey, objection);
    }
  }
  return [...byCluster.values()];
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value.normalize("NFKC").toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function containsExcerpt(transcript: string, excerpt: string): boolean {
  return normalizeQuote(transcript).includes(normalizeQuote(excerpt));
}

function normalizeQuote(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
