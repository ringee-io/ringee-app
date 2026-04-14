export interface EmailContent {
  subject: string;
  body: string;
}

export interface EmailTemplateVars {
  firstName?: string | null;
  firingIndex?: number;
}

type Variant = { subject: string; body: string[] };

const namePrefix = (firstName?: string | null) =>
  firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi,";

const join = (lines: string[]) => lines.join("\n");

/**
 * Plain-text email content only.
 * Keep the copy operational, short, and low-friction.
 * Do not use promotional wording or visual markup.
 *
 * Each template exposes three variants keyed by `firingIndex`:
 *   0 → first nudge (neutral, informative)
 *   1 → follow-up  (acknowledges they haven't acted yet)
 *   2 → last touch (offers help, explicit that we'll stop)
 *
 * If an unknown firing index is requested we clamp to the last variant so
 * the schedule can be extended without a template crash.
 */
const VARIANTS: Record<string, Variant[]> = {
  "ringee.firstCallFollowup": [
    { 
      subject: "Your Ringee account is ready",
      body: [
        "Your Ringee account is already set up.",
        "",
        "The next step is simple: make your first call.",
        "",
        "Open the dialer, enter a number, and test the flow.",
        "",
        "If something is blocking you, reply to this email and tell us what happened.",
      ],
    },
    {
      subject: "You can make your first call now",
      body: [
        "We noticed you have not placed a call yet.",
        "",
        "Most accounts that make a first call within the first few days stick around — so it is worth a quick try.",
        "",
        "You do not need to commit to anything. One test call is enough to see how the flow works.",
        "",
        "If you hit something unexpected, reply and we will help you sort it out.",
      ],
    },
    {
      subject: "Need help making your first call?",
      body: [
        "This is the last reminder about placing your first call on Ringee.",
        "",
        "If there is something specific stopping you — a permissions prompt, a number format, an integration — tell us and we will help directly.",
        "",
        "If you decided Ringee is not the right fit right now, that is fine too. We will not keep nudging.",
      ],
    },
  ],

  "ringee.creditsFollowup": [
    {
      subject: "Your Ringee balance needs attention",
      body: [
        "Your Ringee balance is running low.",
        "",
        "To keep calling without interruptions, add credits from the billing page.",
        "",
        "If the balance looks wrong to you, reply and we will take a look.",
      ],
    },
    {
      subject: "Add credits to continue calling",
      body: [
        "Your balance is still low and that will start blocking new calls soon.",
        "",
        "Adding credits takes about a minute and keeps your current numbers and campaigns running as they are.",
        "",
        "If you prefer auto-reload, you can turn that on from the billing page so this does not come up again.",
      ],
    },
    {
      subject: "Still need to add credits?",
      body: [
        "This is the last reminder about your low balance.",
        "",
        "If you are holding off on purpose — pausing the account, comparing options, waiting for a budget — just reply and let us know.",
        "",
        "Otherwise, your calls will start failing until credits are added.",
      ],
    },
  ],

  "ringee.numberPurchaseFollowup": [
    {
      subject: "Set up your Ringee number",
      body: [
        "Adding a number to your Ringee account is the next useful step.",
        "",
        "It unlocks inbound calls, proper caller ID, and call-backs — which is what most teams actually want.",
        "",
        "You can pick one from the dashboard in a couple of clicks.",
      ],
    },
    {
      subject: "You still have not added a number",
      body: [
        "You can still place outbound calls without a number, but you will be missing inbound and call-back flows until one is added.",
        "",
        "If you are unsure whether you want a local, toll-free, or international number, reply with your use case and we will recommend one.",
      ],
    },
    {
      subject: "Do you want help choosing a number?",
      body: [
        "Last nudge about picking a Ringee number.",
        "",
        "If you already have telephony elsewhere and do not need one here, reply and tell us — we will stop the reminders.",
        "",
        "If you want help picking the right one, we are happy to suggest based on where your calls are going.",
      ],
    },
  ],

  "ringee.contactsImportFollowup": [
    {
      subject: "Import your contacts into Ringee",
      body: [
        "If you plan to use Ringee regularly, importing your contacts is the next useful step.",
        "",
        "It keeps calls, notes, and follow-up tied to the right person.",
        "",
        "You can upload a CSV from the contacts page.",
      ],
    },
    {
      subject: "Your contact list is still missing",
      body: [
        "Without contacts imported, most of Ringee's follow-up and history features will not do much for you.",
        "",
        "If your file has an odd format or the fields do not match, send us a sample and we will help you get it in.",
      ],
    },
    {
      subject: "Need help importing contacts?",
      body: [
        "Last reminder about getting your contacts into Ringee.",
        "",
        "If you do not plan to use Ringee for structured follow-up — just occasional calling — you can ignore this and we will stop sending it.",
      ],
    },
  ],

  "ringee.campaignsCallbacksAdoptionFollowup": [
    {
      subject: "You can organize follow-up inside Ringee",
      body: [
        "You are past the basic calling flow, which is the right moment to organize follow-up.",
        "",
        "Callbacks, campaigns, and DNC handling give you a structured way to stop losing track of conversations.",
        "",
        "Try one of them on a small list first to see how it fits.",
      ],
    },
    {
      subject: "Try callbacks or campaigns next",
      body: [
        "You are still making calls one by one, which works — until it does not.",
        "",
        "Campaigns handle the list and the retries for you. Callbacks keep promised call-backs from slipping. DNC keeps the wrong people off your lists.",
        "",
        "Pick the one that matches the pain you are feeling and start there.",
      ],
    },
    {
      subject: "Ready to go beyond one-off calls?",
      body: [
        "Last note on this. If manual dialing is still working for you, ignore this email.",
        "",
        "If it is not, reply and describe how you are working today — we will suggest the minimum setup that would help, nothing bigger than that.",
      ],
    },
  ],

  "ringee.teamSetupFollowup": [
    {
      subject: "Invite another member to your workspace",
      body: [
        "If this account will be used by more than one person, now is a good moment to invite the rest of the team.",
        "",
        "Shared calling, notes, and analytics only make sense once the workspace reflects who is actually working in it.",
        "",
        "You can invite them from workspace settings.",
      ],
    },
    {
      subject: "Your workspace still has one member",
      body: [
        "Your workspace is still a single-seat workspace.",
        "",
        "If you are planning to stay solo, this reminder does not apply. If not, adding teammates now avoids moving data later.",
        "",
        "Billing follows seats, not invitations — inviting is free until they accept.",
      ],
    },
    {
      subject: "Need help setting up the team workspace?",
      body: [
        "Last reminder about inviting your team.",
        "",
        "If you are not going to use Ringee as a team, ignore this — we will stop sending it.",
        "",
        "If you are stuck on roles, permissions, or SSO, reply and we will walk you through it.",
      ],
    },
  ],

  "ringee.reactivationFollowup": [
    {
      subject: "Checking in about your Ringee account",
      body: [
        "Your Ringee account has been quiet for a while.",
        "",
        "If something blocked you, reply and tell us what happened — we would rather know than guess.",
        "",
        "Your data is still there either way.",
      ],
    },
    {
      subject: "Still planning to use Ringee?",
      body: [
        "We still have not seen activity on your account.",
        "",
        "If you are waiting on something — a teammate, a number port, a client decision — reply and we will keep the account ready without bothering you again.",
      ],
    },
    {
      subject: "Do you want to resume where you left off?",
      body: [
        "This is the last check-in from us.",
        "",
        "Your account, history, and settings are preserved whether you come back next week or next quarter.",
        "",
        "If you want to close the account instead, reply and we will take care of it cleanly.",
      ],
    },
  ],
};

function pickVariant(template: string, firingIndex: number): Variant | null {
  const variants = VARIANTS[template];
  if (!variants || variants.length === 0) return null;
  const safeIndex = Math.min(Math.max(firingIndex, 0), variants.length - 1);
  return variants[safeIndex];
}

export function renderEmailTemplate(
  template: string,
  vars: EmailTemplateVars,
): EmailContent | null {
  const variant = pickVariant(template, vars.firingIndex ?? 0);
  if (!variant) return null;
  return {
    subject: variant.subject,
    body: join([namePrefix(vars.firstName), "", ...variant.body, "", "— Ringee"]),
  };
}
