/** Presentation helpers shared by the visual components. */

export function initials(name?: string | null, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const value = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return value || fallback;
}

export function displayName(input: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phoneNumber?: string | null;
}): string {
  return (
    input.name ||
    input.fullName ||
    [input.firstName, input.lastName].filter(Boolean).join(" ") ||
    input.phoneNumber ||
    "Unknown"
  );
}

/** Light-touch E.164 prettifier for display only (keeps the +). */
export function formatPhone(phone?: string | null): string {
  if (!phone) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return phone;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "";
}

export function titleCase(value?: string | null): string {
  if (!value) return "";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
