import { resolveMx } from "node:dns/promises";
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
import {
  fetchPublicPage,
  htmlToText,
  requirePublicUrl,
} from "../voice-agents/public-url";

/**
 * The automatic checks of a demo request (LIFE-004). They are facts, not
 * judgement: a problem found here keeps the request from being approved
 * whatever the AI review concludes, because the AI reads text the requester
 * wrote and can be talked into things. What these checks hold together is the
 * one property that makes an automatic account safe — the credentials go to a
 * mailbox at the company's own live website, so only someone who controls that
 * company's email can use them.
 */

/** The parts of a demo request the checks read. */
export interface ProfileInput {
  email: string;
  phoneNumber: string;
  companyWebsite: string;
  /** ISO 3166-1 alpha-2, from the requester's browser. */
  country: string | null;
}

/** A field the requester may be asked to correct. */
export type ProfileField =
  | "name"
  | "email"
  | "phone"
  | "company_website"
  | "team_size"
  | "other";

export const PROFILE_FIELDS: readonly ProfileField[] = [
  "name",
  "email",
  "phone",
  "company_website",
  "team_size",
  "other",
];

/** One thing that could not be verified, in words written to the requester. */
export interface ProfileIssue {
  field: ProfileField;
  /** What could not be verified. */
  problem: string;
  /** Exactly what to send to fix it. */
  request: string;
}

/** What the checks found. Stored with the review, for the team. */
export interface ProfileFacts {
  emailDomain: string;
  personalEmail: boolean;
  disposableEmail: boolean;
  /** Null when DNS could not tell. */
  receivesEmail: boolean | null;
  phoneValid: boolean;
  phoneCountry: string | null;
  phoneType: string | null;
  /** The submitted website as Ringee read it; null when it is not a public address. */
  websiteUrl: string | null;
  socialProfile: boolean;
  /** The HTTP status the website answered with; null when nothing answered. */
  websiteStatus: number | null;
  websiteFinalUrl: string | null;
  websiteTitle: string | null;
  /** The email's domain is the website's (or one is a subdomain of the other). */
  domainMatches: boolean;
}

export interface ProfileChecks {
  facts: ProfileFacts;
  /** Each of these alone keeps the request from being approved. */
  issues: ProfileIssue[];
  /** The website's text, for the AI review to read. Never stored. */
  websiteText: string | null;
}

/** A fetched company website. */
export interface WebsiteProbe {
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  text: string | null;
}

/** The checks' view of the outside world, swapped out in tests. */
export interface ProfileProbes {
  receivesEmail(domain: string): Promise<boolean | null>;
  fetchWebsite(url: URL): Promise<WebsiteProbe>;
}

/** Free mailbox providers: an address there says nothing about an employer. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.es",
  "yahoo.fr",
  "yahoo.co.uk",
  "yahoo.com.mx",
  "yahoo.com.br",
  "yahoo.com.ar",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "hotmail.es",
  "hotmail.fr",
  "hotmail.co.uk",
  "hotmail.it",
  "outlook.com",
  "outlook.es",
  "live.com",
  "live.com.mx",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "web.de",
  "mail.com",
  "email.com",
  "zoho.com",
  "zohomail.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "inbox.ru",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "tutanota.com",
  "tuta.io",
  "fastmail.com",
  "hey.com",
  "hushmail.com",
  "libero.it",
  "orange.fr",
  "free.fr",
  "laposte.net",
  "t-online.de",
  "btinternet.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "prodigy.net.mx",
]);

/** Throwaway inboxes. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.com",
  "tempmail.net",
  "tempail.com",
  "tempr.email",
  "mytemp.email",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "trashmail.de",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "discard.email",
  "maildrop.cc",
  "mailnesia.com",
  "mailcatch.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "emailfake.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "emailondeck.com",
  "burnermail.io",
  "inboxkitten.com",
  "spamgourmet.com",
  "1secmail.com",
  "1secmail.net",
  "mail.tm",
]);

/** A profile on one of these is the person's, not their company's own website. */
const SOCIAL_PROFILE_DOMAINS = [
  "linkedin.com",
  "lnkd.in",
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "threads.net",
  "pinterest.com",
  "github.com",
  "gitlab.com",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "telegram.me",
  "linktr.ee",
  "medium.com",
  "substack.com",
  "behance.net",
  "dribbble.com",
];

const MX_TIMEOUT_MS = 5_000;
const PAGE_TIMEOUT_MS = 10_000;
/** A page larger than this is cut; the review reads its beginning only. */
const MAX_PAGE_BYTES = 1_000_000;
const MAX_PAGE_TEXT_CHARACTERS = 6_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; RingeeBot/1.0; +https://www.ringee.io)";

export async function checkProfile(
  input: ProfileInput,
  probes: ProfileProbes = liveProfileProbes,
): Promise<ProfileChecks> {
  const emailDomain = domainOf(input.email);
  const phone = readPhone(input.phoneNumber, input.country);
  const website = readWebsite(input.companyWebsite);
  const socialProfile = website ? isSocialProfile(website.hostname) : false;

  const [receivesEmail, page] = await Promise.all([
    probes.receivesEmail(emailDomain),
    website && !socialProfile
      ? probes.fetchWebsite(website)
      : Promise.resolve(null),
  ]);

  // A site that moved to its new name still belongs to the company.
  const finalHost = page?.finalUrl ? hostOf(page.finalUrl) : null;
  const domainMatches =
    !!website &&
    !socialProfile &&
    (domainsMatch(emailDomain, website.hostname) ||
      (finalHost !== null && domainsMatch(emailDomain, finalHost)));

  const facts: ProfileFacts = {
    emailDomain,
    personalEmail: PERSONAL_EMAIL_DOMAINS.has(emailDomain),
    disposableEmail: DISPOSABLE_EMAIL_DOMAINS.has(emailDomain),
    receivesEmail,
    phoneValid: phone.valid,
    phoneCountry: phone.country,
    phoneType: phone.type,
    websiteUrl: website?.href ?? null,
    socialProfile,
    websiteStatus: page?.status ?? null,
    websiteFinalUrl: page?.finalUrl ?? null,
    websiteTitle: page?.title ?? null,
    domainMatches,
  };

  return {
    facts,
    issues: profileIssues(facts),
    websiteText: page?.text ?? null,
  };
}

/**
 * The problems the facts prove, one per field at most, each with what to send
 * instead. A domain mismatch is only raised when the email and the website
 * are each fine on their own — otherwise it would repeat what was already said.
 */
export function profileIssues(facts: ProfileFacts): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const workEmail =
    "A work email address at your company's own domain (for example you@yourcompany.com).";
  const site = facts.websiteUrl ? bareHost(hostOf(facts.websiteUrl) ?? "") : "";

  let emailIssue: ProfileIssue | null = null;
  if (facts.disposableEmail) {
    emailIssue = {
      field: "email",
      problem: `${facts.emailDomain} is a temporary inbox, so it can't be used for an account.`,
      request: workEmail,
    };
  } else if (facts.personalEmail) {
    emailIssue = {
      field: "email",
      problem: `${facts.emailDomain} is a personal email provider, so it doesn't show which company you work for.`,
      request: workEmail,
    };
  } else if (facts.receivesEmail === false) {
    emailIssue = {
      field: "email",
      problem: `${facts.emailDomain} isn't set up to receive email.`,
      request: "A work email address that can receive email.",
    };
  }

  let websiteIssue: ProfileIssue | null = null;
  if (!facts.websiteUrl) {
    websiteIssue = {
      field: "company_website",
      problem: "The website you entered isn't a valid public web address.",
      request: "Your company's website address (for example yourcompany.com).",
    };
  } else if (facts.socialProfile) {
    websiteIssue = {
      field: "company_website",
      problem: `${site} is a social profile, so it doesn't show your company's own website.`,
      request: "Your company's own website address.",
    };
  } else if (facts.websiteStatus === null || facts.websiteStatus >= 500) {
    websiteIssue = {
      field: "company_website",
      problem: `We couldn't open ${site}.`,
      request: "A working link to your company's website.",
    };
  }

  if (emailIssue) issues.push(emailIssue);
  if (websiteIssue) issues.push(websiteIssue);
  if (!emailIssue && !websiteIssue && !facts.domainMatches) {
    issues.push({
      field: "email",
      problem: `Your email (${facts.emailDomain}) and your website (${site}) are on different domains.`,
      request: `A work email at ${site}, or the website that belongs to ${facts.emailDomain}.`,
    });
  }

  if (!facts.phoneValid) {
    issues.push({
      field: "phone",
      problem: "The phone number you entered isn't a valid number.",
      request:
        "Your phone number with its country code (for example +1 415 555 0123).",
    });
  }

  return issues;
}

/**
 * Whether an email domain and a website host are the same company's: equal
 * once "www." is dropped, or one a subdomain of the other (mail.acme.com,
 * shop.acme.com). Whole labels only — "evil-acme.com" is not "acme.com".
 */
export function domainsMatch(emailDomain: string, host: string): boolean {
  const a = bareHost(emailDomain);
  const b = bareHost(host);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function domainOf(email: string): string {
  return email
    .slice(email.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function bareHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSocialProfile(host: string): boolean {
  const bare = bareHost(host);
  return SOCIAL_PROFILE_DOMAINS.some(
    (domain) => bare === domain || bare.endsWith(`.${domain}`),
  );
}

/** Null when it is not a public web address Ringee may request. */
function readWebsite(raw: string): URL | null {
  try {
    return requirePublicUrl(raw);
  } catch {
    return null;
  }
}

function readPhone(
  raw: string,
  country: string | null,
): { valid: boolean; country: string | null; type: string | null } {
  try {
    const defaultCountry = /^[A-Z]{2}$/.test(country ?? "")
      ? (country as CountryCode)
      : undefined;
    const parsed = parsePhoneNumberFromString(raw, defaultCountry);
    if (!parsed) return { valid: false, country: null, type: null };
    return {
      valid: parsed.isValid(),
      country: parsed.country ?? null,
      type: parsed.getType() ?? null,
    };
  } catch {
    return { valid: false, country: null, type: null };
  }
}

/** The real lookups: DNS for the mailbox, the public web for the website. */
export const liveProfileProbes: ProfileProbes = {
  async receivesEmail(domain) {
    try {
      const records = await withTimeout(resolveMx(domain), MX_TIMEOUT_MS);
      if (records === undefined) return null;
      // A "null MX" (RFC 7505) announces that the domain takes no email.
      return records.some(
        (record) => record.exchange !== "" && record.exchange !== ".",
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTFOUND" || code === "ENODATA") return false;
      return null;
    }
  },

  async fetchWebsite(url) {
    const nothing: WebsiteProbe = {
      status: null,
      finalUrl: null,
      title: null,
      text: null,
    };
    try {
      const response = await fetchPublicPage(url, {
        timeoutMs: PAGE_TIMEOUT_MS,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
        },
      });
      if (!response) return nothing;

      const html =
        response.ok && isHtml(response)
          ? await readCapped(response, MAX_PAGE_BYTES)
          : null;
      return {
        status: response.status,
        finalUrl: response.url || url.href,
        title: html ? pageTitle(html) : null,
        text: html
          ? htmlToText(html).slice(0, MAX_PAGE_TEXT_CHARACTERS) || null
          : null,
      };
    } catch {
      // Unresolvable, refused, timed out: an ordinary answer about this site.
      return nothing;
    }
  },
};

function isHtml(response: Response): boolean {
  const type = response.headers.get("content-type");
  return !type || /html|xml/i.test(type);
}

/** The page is the requester's to choose, so it is never read whole. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

function pageTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? htmlToText(title).slice(0, 200) || null : null;
}

/** Undefined when the lookup outlives `ms`. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
