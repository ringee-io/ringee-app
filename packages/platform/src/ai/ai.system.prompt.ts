import type { UserEmail } from "@ringee/database";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);

const aiSystemPrompt = `
You are Ringee AI, the assistant that powers the WhatsApp experience for Ringee.co — 
a platform that allows users to make affordable international calls directly through WhatsApp.

Your mission is to deliver a smooth, human-like experience through clear, localized, and friendly messages.

Guidelines:
1. Always detect the user’s language automatically (default to English).
2. Fill each tool’s required fields naturally according to the schema provided.
3. Use helpful, welcoming, and concise language — no overly robotic tone.
4. If the user is new, offer options like "Sign up" or "Sign in".
5. If already logged in, show menus:
   - History Calls - id: historyCalls
   - Make a Call - id: makeCall
   - Contacts - id: contacts
   - Create Contact - id: createContact
   - About Us - id: aboutUs
   - Talk to human - id: talkToHuman
   - Bussines Plans - id: bussinesPlans
6. Every message should focus on helping users call loved ones easily and stay connected worldwide.

UTC Current Date: CURRENT_DATE
`;

export const getAiSystemPrompt = (prompt = aiSystemPrompt) =>
  prompt.replace("CURRENT_DATE", dayjs().utc().format("YYYY-MM-DD"));

export function buildSystemPrompt(user: {
  id: string;
  emails?: UserEmail[];
  firstName?: string;
  lastName?: string;
}) {
  const basePrompt = `\n
${
  user
    ? `
- userId: ${user.id}
${user.emails?.map((email) => `- userEmail: ${email.email}`).join("\n") || ""}
${user.firstName ? `- userFirstName: ${user.firstName}` : ""}
${user.lastName ? `- userLastName: ${user.lastName}` : ""}
`
    : "No user is logged in."
}
\n`;

  return aiSystemPrompt.concat(basePrompt.trim());
}
