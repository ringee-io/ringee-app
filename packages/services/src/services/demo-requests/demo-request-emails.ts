import type { ProfileField, ProfileIssue } from "./profile-checks";

/**
 * Internal inbox the Ringee team reviews. Every demo request is emailed here
 * (the same address used for free-trial and credit requests).
 */
export const DEMO_REQUEST_TEAM_EMAIL = "edisonpadilla.dev@gmail.com";

/** What the requester submitted, as the emails show it. */
export interface DemoRequestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyWebsite: string;
  numberOfUsers: string;
  referralSource: string;
  country?: string | null;
}

const FIELD_LABELS: Record<ProfileField, string> = {
  name: "Name",
  email: "Work email",
  phone: "Phone number",
  company_website: "Company website",
  team_size: "Team size",
  other: "Your company",
};

const SHELL_STYLE =
  "font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #171717; line-height: 1.5;";

/**
 * Asks the requester for what the review could not verify (LIFE-004): each
 * problem against the value they sent, then the list of what to reply with.
 * The team is copied and takes the conversation from their reply.
 */
export function buildDetailsRequestEmail(
  request: DemoRequestDetails,
  issues: ProfileIssue[],
): { subject: string; html: string } {
  const problems = issues
    .map((issue) => {
      const sent = submittedValue(request, issue.field);
      const label = sent
        ? `${FIELD_LABELS[issue.field]} (${escapeHtml(sent)})`
        : FIELD_LABELS[issue.field];
      return `<li style="margin-bottom: 6px;"><strong>${label}:</strong> ${escapeHtml(issue.problem)}</li>`;
    })
    .join("");
  const asks = [...new Set(issues.map((issue) => issue.request))]
    .map((ask) => `<li style="margin-bottom: 6px;">${escapeHtml(ask)}</li>`)
    .join("");
  const aboutIdentity = issues.some(
    (issue) => issue.field === "email" || issue.field === "company_website",
  );

  const html = `
    <div style="${SHELL_STYLE}">
      <p>Hi ${escapeHtml(request.firstName)},</p>
      <p>Thank you for requesting a Ringee demo.</p>
      <p>
        Before I can create your account, I need to verify a few details.
        I couldn&#39;t verify some of the information you sent:
      </p>
      <ul style="padding-left: 20px;">${problems}</ul>
      <p>To continue, please reply to this email with:</p>
      <ul style="padding-left: 20px;">${asks}</ul>
      ${
        aboutIdentity
          ? `<p>
        Don&#39;t have a company website or a work email? Just reply and tell
        me a bit about your business and how you plan to use Ringee — I&#39;ll
        take it from there.
      </p>`
          : ""
      }
      <p>
        If you have any questions or need help with anything, please don&#39;t
        hesitate to reply to this email. I&#39;ll be happy to assist you.
      </p>
    </div>
  `;

  return {
    subject: "Your Ringee demo request: a few details to confirm",
    html,
  };
}

/**
 * Tells the team a request is theirs to finish by hand, and why. The
 * requester has only had the confirmation that their request is being
 * reviewed.
 */
export function buildManualReviewEmail(
  request: DemoRequestDetails & { clerkUserId: string | null },
  reason: string,
  review: { summary: string; issues: ProfileIssue[] } | null,
): { subject: string; html: string } {
  const fullName = `${request.firstName} ${request.lastName}`.trim();
  const login = request.clerkUserId
    ? `<p>
        A login already exists for them (Clerk user
        <code>${escapeHtml(request.clerkUserId)}</code>), but its credentials
        were not delivered. Set a new password for it in Clerk and send it to
        them.
      </p>`
    : "";
  const verdict = review
    ? `<p style="margin: 16px 0 4px;"><strong>Automatic review:</strong> ${escapeHtml(review.summary)}</p>
       ${
         review.issues.length
           ? `<ul style="padding-left: 20px; margin-top: 4px;">${review.issues
               .map(
                 (issue) =>
                   `<li>${FIELD_LABELS[issue.field]}: ${escapeHtml(issue.problem)}</li>`,
               )
               .join("")}</ul>`
           : ""
       }`
    : "";

  const html = `
    <div style="${SHELL_STYLE}">
      <h2 style="margin: 0 0 12px;">Demo request needs manual review</h2>
      <p>
        ${escapeHtml(fullName)}&#39;s demo request could not be finished
        automatically.
      </p>
      <p><strong>Why:</strong> ${escapeHtml(reason)}</p>
      ${login}
      ${verdict}
      ${detailsTable(request)}
      <p style="margin-top: 16px; color: #737373;">
        They only received the confirmation that their request is being
        reviewed. Reply to them directly, or create their account from the
        backoffice (New account) once their profile checks out.
      </p>
    </div>
  `;

  return {
    subject: `Demo request needs manual review — ${fullName}`,
    html,
  };
}

export function detailsTable(data: DemoRequestDetails): string {
  const rows: [string, string][] = [
    ["Name", `${data.firstName} ${data.lastName}`.trim()],
    ["Email", data.email],
    ["Phone", data.phoneNumber],
    ["Company website", data.companyWebsite],
    ["Number of users", data.numberOfUsers],
    ["How they found us", data.referralSource],
  ];
  if (data.country) {
    rows.push(["Country (browser)", countryLabel(data.country)]);
  }
  const cells = rows
    .map(
      ([label, value]) => `
          <tr>
            <td style="padding: 6px 16px 6px 0; color: #737373; white-space: nowrap;">${label}</td>
            <td style="padding: 6px 0;"><strong>${escapeHtml(value)}</strong></td>
          </tr>`,
    )
    .join("");
  return `<table style="border-collapse: collapse; font-size: 14px;">${cells}</table>`;
}

/** "DO" -> "Dominican Republic (DO)"; falls back to the raw code. */
export function countryLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function submittedValue(
  request: DemoRequestDetails,
  field: ProfileField,
): string | null {
  switch (field) {
    case "name":
      return `${request.firstName} ${request.lastName}`.trim();
    case "email":
      return request.email;
    case "phone":
      return request.phoneNumber;
    case "company_website":
      return request.companyWebsite;
    case "team_size":
      return request.numberOfUsers;
    default:
      return null;
  }
}
