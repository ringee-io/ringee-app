/**
 * What failed, for a log line, without the error's message: Prisma and
 * providers echo ids, tokens and rejected values into it (SECURITY.md, "Logs
 * and emails carry no secrets"). The class, the provider or Prisma code, and an
 * HTTP status when there is one — enough to tell failures apart and to find the
 * row that keeps the full reason.
 */
export function errorKind(error: unknown): string {
  if (error === null || error === undefined) return "unknown error";
  if (typeof error !== "object") return typeof error;
  const parts: string[] = [
    error instanceof Error ? error.name : "unknown error",
  ];
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number")
    parts.push(String(code));
  const getStatus = (error as { getStatus?: unknown }).getStatus;
  if (typeof getStatus === "function") {
    const status: unknown = getStatus.call(error);
    if (typeof status === "number") parts.push(String(status));
  }
  return parts.join(" ");
}
