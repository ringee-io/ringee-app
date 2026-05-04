export interface EmailContent {
  subject: string;
  body: string;
}

export interface EmailTemplateVars {
  firstName?: string | null;
  organizationName?: string | null;
  firingIndex?: number;
}

type Variant = { subject: string; body: string[] };

const namePrefix = (firstName?: string | null) =>
  firstName?.trim() ? `Hi ${firstName.trim()},` : "Hi,";

/**
 * One-line workspace context inserted right under the greeting when the user
 * belongs to an organization. Stays empty for solo accounts so the email does
 * not invent a workspace that does not exist.
 */
const workspaceLine = (organizationName?: string | null) =>
  organizationName?.trim()
    ? `Quick note about your ${organizationName.trim()} workspace on Ringee.`
    : null;

const join = (lines: string[]) => lines.join("\n");

/**
 * Plain-text-style email content.
 * The handler converts \n to <br> before sending, so paragraph breaks survive.
 *
 * Each template carries one variant per scheduled firing in
 * `workflows/timing.ts` — first nudge is informative, middle ones get more
 * specific and empathetic, the final one is a clean wrap-up so people don't
 * feel hounded. If the schedule is extended past the variants list,
 * `pickVariant` clamps to the last one.
 *
 * Engagement principles applied:
 *  - Specific failure modes / numbers beat generic prose ("most accounts...
 *    in 24h" beats "soon").
 *  - Each email has exactly one ask.
 *  - The final variant always offers an exit ("reply and I'll mute these")
 *    so we collect signal instead of just stopping.
 */
const VARIANTS: Record<string, Variant[]> = {
  // Schedule: 10min, 6h, 24h, 3d, 7d → 5 variants.
  "ringee.firstCallFollowup": [
    {
      subject: "You're one call away from seeing how Ringee works",
      body: [
        "Your account is set up — the fastest way to know if Ringee fits is one test call.",
        "",
        "Open the dialer, type any number you trust, hang up after 10 seconds. That is the whole loop.",
        "",
        "If a permission prompt or a number format trips you up, reply with what you are seeing and I will point you to the fix.",
      ],
    },
    {
      subject: "Anything blocking your first call?",
      body: [
        "Six hours in and no first call yet. Usually it is one of three things:",
        "",
        "• Microphone permission was dismissed → check your browser address bar.",
        "• The number format was not accepted → try +<country><number>.",
        "• You opened the app but got pulled into something else → totally normal.",
        "",
        "Reply with whichever applies and I will unblock it directly.",
      ],
    },
    {
      subject: "Most new accounts place their first call within 24h",
      body: [
        "Soft check-in — you are in the small group that signed up but has not placed a call yet.",
        "",
        "Not pushing. I would rather know if something tripped you up than keep guessing.",
        "",
        "If Ringee turned out not to be what you expected, that is useful too. Tell me what you were hoping it would do and I will tell you straight whether it does it.",
      ],
    },
    {
      subject: "What changed?",
      body: [
        "Three days ago you signed up for Ringee, and the account is still untouched.",
        "",
        "I would rather hear what got in the way than keep sending reminders. A one-line reply is enough — \"too busy\", \"wrong tool\", \"pricing\", whatever it is.",
        "",
        "If the answer is \"I will get to it next week\", say that and I will mute these until then.",
      ],
    },
    {
      subject: "Closing the loop on your Ringee account",
      body: [
        "Last note from me about getting started.",
        "",
        "Your account stays open and your settings are preserved — no deletion, no expiry. If you come back next month or next quarter, the dialer will be where you left it.",
        "",
        "If you would rather close the account now, reply and I will handle it the same day.",
      ],
    },
  ],

  // Schedule: 1h, 24h, 4d, 7d → 4 variants.
  "ringee.creditsFollowup": [
    {
      subject: "Heads up — your Ringee balance is getting thin",
      body: [
        "Your balance is low enough that a long call or a busy day will start failing.",
        "",
        "Topping up from the billing page takes about 30 seconds. Turning on auto-reload on the same page means this email never shows up again.",
        "",
        "Numbers, campaigns, and call history are not affected by a low balance — only outbound calls are.",
      ],
    },
    {
      subject: "Calls are about to start failing",
      body: [
        "Quick reminder: your balance is now below what most accounts burn in a single afternoon.",
        "",
        "Once it hits zero, outbound calls return a busy tone until credits are added. Inbound still works.",
        "",
        "If you want to pause the account intentionally instead of topping up, reply and I will mute the reminders.",
      ],
    },
    {
      subject: "Auto-reload would have skipped this email",
      body: [
        "Your balance is still low and outbound calls are at risk.",
        "",
        "If running out of credits at random moments is not useful for you (it never is), turn on auto-reload — pick a threshold and a top-up amount once and you are done.",
        "",
        "Holding off on purpose? Reply and tell me what is going on; I will mute these.",
      ],
    },
    {
      subject: "Outbound calls are now blocked",
      body: [
        "Your balance hit zero and new outbound calls are returning a busy tone.",
        "",
        "A top-up restores them immediately — nothing else to configure.",
        "",
        "If the plan is to pause the account, reply and I will close out these reminders cleanly.",
      ],
    },
  ],

  // Schedule: 1d, 3d, 7d, 10d → 4 variants.
  "ringee.numberPurchaseFollowup": [
    {
      subject: "Pick a number — it unlocks inbound and proper caller ID",
      body: [
        "You can place outbound calls without a Ringee number, but the people you call see a generic caller ID and they cannot call you back.",
        "",
        "Adding a number takes a couple of clicks and unlocks inbound, voicemail, and a caller ID prospects actually recognize.",
        "",
        "Local for trust, toll-free for inbound at scale, international for cross-border — pick whichever matches who you call.",
      ],
    },
    {
      subject: "You are missing inbound calls without a number",
      body: [
        "Three days in without a number on the account.",
        "",
        "Most people do not notice how often prospects call back — until they do not, because the caller ID was unfamiliar.",
        "",
        "If you already run telephony elsewhere and do not need a number here, reply and I will mute these reminders.",
      ],
    },
    {
      subject: "Want a recommendation on which number to pick?",
      body: [
        "If choosing between local, toll-free, and international is what is holding you back, I can shortcut it.",
        "",
        "Reply with: which countries you call into, whether you need inbound, and roughly how many calls per day. I will suggest the cheapest setup that fits.",
        "",
        "Picking wrong is also fine — numbers can be released and replaced anytime.",
      ],
    },
    {
      subject: "Last reminder about adding a number",
      body: [
        "Final note about Ringee numbers from me.",
        "",
        "If your workflow is outbound-only and the unknown caller ID is not a problem, ignore this and I will stop sending it.",
        "",
        "If you want help thinking through the choice, reply with your use case and I will recommend the right one.",
      ],
    },
  ],

  // Schedule: 1d, 3d, 5d, 7d → 4 variants.
  "ringee.contactsImportFollowup": [
    {
      subject: "Calls are easier when contacts have names",
      body: [
        "Right now every call you make shows up in history as a phone number.",
        "",
        "Importing your contacts (one CSV upload) attaches names, notes, and history to each conversation. Small thing that compounds quickly.",
        "",
        "If you do not have a clean CSV yet, an export from your CRM, Google Contacts, or even a spreadsheet works.",
      ],
    },
    {
      subject: "Your call history is still all phone numbers",
      body: [
        "Three days in and the contact list is still empty.",
        "",
        "Without contacts, follow-up reminders, search by name, and call notes all get a lot less useful.",
        "",
        "If your CSV has odd columns or you are not sure which fields map where, send a sample (5 rows is enough) and I will tell you exactly what to change.",
      ],
    },
    {
      subject: "Stuck on the CSV format?",
      body: [
        "Most contact-import problems are one of:",
        "",
        "• Phone numbers without country code → add +1, +44, etc.",
        "• Column headers in another language → rename to name/phone/email.",
        "• Excel saved with semicolons → re-export as comma-separated.",
        "",
        "If none of these match what you are seeing, send the file and I will look at it.",
      ],
    },
    {
      subject: "Last note about importing contacts",
      body: [
        "Final reminder about contacts.",
        "",
        "If you are using Ringee for occasional one-off calling and do not need a structured list, ignore this — I will stop sending it.",
        "",
        "If you do want them in but kept putting it off, reply with what is blocking you and I will handle it.",
      ],
    },
  ],

  // Schedule: 5d, 8d, 12d, 14d → 4 variants.
  "ringee.campaignsCallbacksAdoptionFollowup": [
    {
      subject: "You are past the basics — time to stop dialing one by one",
      body: [
        "You have made enough calls to know how Ringee works. The next leverage is structure.",
        "",
        "• Campaigns: feed in a list, Ringee dials and retries. You spend the time talking, not picking the next row.",
        "• Callbacks: \"call me back at 3pm\" becomes a scheduled task instead of a sticky note.",
        "• DNC: once someone says do not call, they are never accidentally dialed again.",
        "",
        "Pick the one that matches the friction you feel today.",
      ],
    },
    {
      subject: "Try a campaign on a 10-lead list",
      body: [
        "Easiest way to know if campaigns help: take 10 leads you would call manually anyway and run them through one.",
        "",
        "You will know within an hour whether it saves you time at scale.",
        "",
        "If nothing about the current setup feels broken, ignore this — these features exist for when manual stops scaling.",
      ],
    },
    {
      subject: "Stop forgetting promised follow-ups",
      body: [
        "If you have ever ended a call with \"I will call you back tomorrow\" and then did not — callbacks fix exactly that.",
        "",
        "Set the time during the call. Ringee surfaces it back to you (or a teammate) when it is due.",
        "",
        "Five minutes to try, no setup beyond turning it on.",
      ],
    },
    {
      subject: "Last note on campaigns and callbacks",
      body: [
        "Final reminder. If manual dialing still works for your volume, ignore this.",
        "",
        "If something feels heavy and you cannot tell whether the fix is a campaign, callbacks, or a different tool altogether — describe how you are working today and I will suggest the smallest change that would help.",
      ],
    },
  ],

  // Schedule: 7d, 10d, 14d → 3 variants.
  "ringee.teamSetupFollowup": [
    {
      subject: "Bring your team into the workspace",
      body: [
        "Your workspace is set up but you are still the only seat in it.",
        "",
        "Sharing call history, notes, and analytics only starts to pay off once the workspace reflects who is actually doing the work.",
        "",
        "Inviting is free — billing only kicks in once a teammate accepts and starts using the account.",
      ],
    },
    {
      subject: "Inviting is free until they accept",
      body: [
        "Quick reminder that pending invites do not cost anything — you can send them now and clean up the unaccepted ones later.",
        "",
        "If you are still deciding who needs access, sending an invite to yourself on a second email also works for testing the team flow.",
        "",
        "If this account will stay solo, ignore this — I will stop sending it.",
      ],
    },
    {
      subject: "Last note about your team setup",
      body: [
        "Final reminder about inviting teammates.",
        "",
        "If permissions, roles, or SSO setup is what is holding you back, reply with where you are stuck and I will walk through it.",
        "",
        "Otherwise, if Ringee turns out to be a single-seat tool for you, no problem — these reminders end here.",
      ],
    },
  ],

  // Schedule: 7d, 14d, 21d, 30d → 4 variants.
  "ringee.reactivationFollowup": [
    {
      subject: "Checking in — anything we can unblock?",
      body: [
        "Your account has been quiet for about a week.",
        "",
        "More often than not, the silence is something small: a teammate did not respond, a port took longer than expected, the project paused.",
        "",
        "If any of that maps to your situation, reply and I will keep the account ready without bothering you.",
      ],
    },
    {
      subject: "Still planning to use Ringee?",
      body: [
        "Two weeks of inactivity on the account.",
        "",
        "Honest question: is Ringee still in your plan, or did the project shift?",
        "",
        "Either answer is useful — \"yes, just delayed\" means I mute these for a while; \"no, moved on\" means I can close the loop properly.",
      ],
    },
    {
      subject: "Your account is paused, not expired",
      body: [
        "Three weeks since the last activity.",
        "",
        "Just a heads-up that none of your data is going anywhere — numbers, contacts, history, and settings are preserved exactly as you left them.",
        "",
        "When you are ready to come back, the workspace will be in the same state. No reactivation needed.",
      ],
    },
    {
      subject: "Last check-in from us",
      body: [
        "Final email from this thread.",
        "",
        "If you want to resume, just sign in — everything is where you left it.",
        "",
        "If you would rather close the account, reply and I will do it cleanly the same day. Either way, no more emails after this one.",
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

  const greeting = namePrefix(vars.firstName);
  const workspace = workspaceLine(vars.organizationName);

  const lines: string[] = [greeting, ""];
  if (workspace) lines.push(workspace, "");
  lines.push(...variant.body, "", "— Ringee");

  return {
    subject: variant.subject,
    body: join(lines),
  };
}
