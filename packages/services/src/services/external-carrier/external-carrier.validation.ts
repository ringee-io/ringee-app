import { BadRequestException } from "@nestjs/common";
import { isIP } from "node:net";
import { normalizePhoneE164 } from "@ringee/platform";
import { requirePublicUrl } from "../voice-agents/public-url";

export interface SipEndpointInput {
  extension: string;
  proxy: string;
  sipUsername: string;
  password?: string;
  transport: "UDP" | "TCP" | "TLS";
  authUsername?: string | null;
  fromUser?: string | null;
  outboundProxy?: string | null;
  expirationSec?: number;
}

function hasControlCharacters(value: string) {
  return [...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function requireText(value: unknown, field: string, max = 128) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    hasControlCharacters(value)
  ) {
    throw new BadRequestException(`Invalid ${field}.`);
  }
  return value.trim();
}

/** Syntax checks only: Ringee never connects to or probes the supplied host. */
export function normalizeSipProxy(value: unknown) {
  const raw = requireText(value, "SIP proxy", 260);
  if (/[\s/@?#%\\]/.test(raw))
    throw new BadRequestException(
      "Use a SIP hostname or IP with an optional port.",
    );
  const match = raw.match(
    /^(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/,
  );
  if (!match || (match[2] && (+match[2] < 1 || +match[2] > 65535)))
    throw new BadRequestException("Invalid SIP host or port.");
  const host = match[1].replace(/^\[|\]$/g, "");
  if (
    !isIP(host) &&
    (!host.includes(".") ||
      host.length > 253 ||
      !host
        .split(".")
        .every((label) =>
          /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
        ))
  ) {
    throw new BadRequestException(
      "Use a complete SIP hostname or a public IP address.",
    );
  }
  requirePublicUrl(`https://${raw}`);
  return raw.toLowerCase();
}

export function normalizeSipInput(input: SipEndpointInput, creating: boolean) {
  const extension = requireText(input.extension, "extension", 64);
  if (!/^[a-zA-Z0-9_.+*-]+$/.test(extension))
    throw new BadRequestException("Invalid extension.");
  const sipUsername = requireText(input.sipUsername, "SIP username", 256);
  // The format the carrier connection accepts for the username it registers
  // with (Telnyx UAC `external_uac_settings.username`). Refused here, the
  // customer gets a clear answer instead of a saved extension the provider
  // rejects.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,255}$/.test(sipUsername))
    throw new BadRequestException(
      "The SIP username must be 4 to 256 letters, digits, hyphens or underscores, starting with a letter or digit.",
    );
  if (!["UDP", "TCP", "TLS"].includes(input.transport))
    throw new BadRequestException("Invalid SIP transport.");
  if (creating || input.password !== undefined) {
    if (
      typeof input.password !== "string" ||
      input.password.length < 1 ||
      input.password.length > 256 ||
      hasControlCharacters(input.password)
    )
      throw new BadRequestException("Invalid SIP password.");
  }
  const expirationSec = input.expirationSec ?? 600;
  if (
    !Number.isInteger(expirationSec) ||
    expirationSec < 60 ||
    expirationSec > 86400
  )
    throw new BadRequestException(
      "Registration expiry must be between 60 and 86400 seconds.",
    );
  const optional = (value: unknown, field: string) =>
    value == null || value === "" ? null : requireText(value, field);
  return {
    extension,
    sipUsername,
    proxy: normalizeSipProxy(input.proxy),
    transport: input.transport,
    authUsername: optional(input.authUsername, "authentication username"),
    fromUser: optional(input.fromUser, "from user"),
    outboundProxy: input.outboundProxy
      ? normalizeSipProxy(input.outboundProxy)
      : null,
    expirationSec,
  };
}

/** Strict E.164: what Ringee dials, records and presents. */
export function normalizeInternationalNumber(value: unknown) {
  const raw = requireText(value, "phone number", 40);
  if (!/^\+[\d ()-.]+$/.test(raw))
    throw new BadRequestException(
      "Use an international phone number beginning with +.",
    );
  const number = normalizePhoneE164(raw);
  if (!number || !/^\+[1-9]\d{6,14}$/.test(number))
    throw new BadRequestException("Invalid international phone number.");
  return number;
}

/**
 * An external number as the customer's carrier writes it: international, with
 * or without the leading `+`. The spelling is kept — it is also how the
 * carrier is sent the numbers it dials (`inCarrierFormat`).
 */
export function normalizeExternalNumber(value: unknown) {
  const raw = requireText(value, "phone number", 40);
  if (raw.startsWith("+")) return normalizeInternationalNumber(raw);
  if (!/^[\d\s().-]+$/.test(raw))
    throw new BadRequestException(
      "Use an international phone number, with or without the leading +.",
    );
  const digits = raw.replace(/[\s().-]/g, "");
  if (!/^[1-9]\d{6,14}$/.test(digits))
    throw new BadRequestException("Invalid international phone number.");
  return digits;
}

/** The E.164 form of a stored external number, whichever way it was saved. */
export function externalNumberE164(stored: string) {
  return stored.startsWith("+") ? stored : `+${stored}`;
}

/** Every spelling an external number with this E.164 form may be stored as. */
export function externalNumberSpellings(e164: string) {
  return e164.startsWith("+") ? [e164, e164.slice(1)] : [e164];
}

/**
 * An E.164 number written the way the carrier writes its own external number:
 * with the `+`, or without it.
 */
export function inCarrierFormat(e164: string, stored: string) {
  return stored.startsWith("+") ? e164 : e164.replace(/^\+/, "");
}
