/**
 * The CRM attribute that names the Ringee campaign a synced person belongs to.
 *
 * A workspace marks people for an outbound campaign by writing the campaign's
 * Ringee id into a field on the CRM record — standard or custom. The field is
 * matched by name, ignoring case and separators, so "Campaign", "campaign",
 * "Campaign ID" and "Ringee Campaign" all resolve: the CRM admin who creates
 * the column should not have to reproduce a provider slug exactly.
 */
const CAMPAIGN_FIELD_KEYS = [
  "campaign",
  "campaignid",
  "ringeecampaign",
  "ringeecampaignid",
];

/**
 * `Campaign.id` is a Postgres `uuid`. Shape-checking the value here is not
 * politeness: handing a non-uuid string to a uuid column makes Prisma throw
 * instead of answering "no such campaign", which would turn a mistyped CRM
 * field into a failed contact sync.
 */
const CAMPAIGN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CrmCampaignField = {
  /** The CRM's own key, so a log line names what the admin has to fix. */
  field: string;
  /** Exactly what the CRM held, trimmed. */
  raw: string;
  /** The Ringee campaign id, or null when the value is not one. */
  campaignId: string | null;
};

/**
 * Read the campaign a CRM record points at, from the normalized custom fields
 * an adapter produced. Returns null when the record carries no campaign field
 * at all — by far the common case, and not something to report on.
 */
export function readCrmCampaignField(
  customFields: Record<string, unknown>,
): CrmCampaignField | null {
  const byNormalizedKey = new Map<string, { field: string; raw: string }>();

  for (const [field, value] of Object.entries(customFields)) {
    const normalizedKey = field.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!CAMPAIGN_FIELD_KEYS.includes(normalizedKey)) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    const raw = String(value).trim();
    if (!raw || byNormalizedKey.has(normalizedKey)) continue;
    byNormalizedKey.set(normalizedKey, { field, raw });
  }

  // Fixed precedence rather than object order: which key wins must not depend
  // on how the provider happened to serialize its attributes.
  for (const key of CAMPAIGN_FIELD_KEYS) {
    const hit = byNormalizedKey.get(key);
    if (!hit) continue;
    return {
      field: hit.field,
      raw: hit.raw,
      campaignId: CAMPAIGN_ID_PATTERN.test(hit.raw) ? hit.raw : null,
    };
  }

  return null;
}
