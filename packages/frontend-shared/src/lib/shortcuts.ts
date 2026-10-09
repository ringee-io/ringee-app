/**
 * When a calling screen's keyboard shortcuts may act: the campaign workspace
 * (digits pick an outcome, Enter saves it or dials, S skips) and the Call
 * page (N calls the next person). None of them ever hangs up: a live call
 * ends by the hang-up button or the other party, and by nothing else.
 */

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ACTIVATION_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "option",
  "combobox",
  "checkbox",
  "tab",
]);

/** The key belongs to a field the agent is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Enter or Space on this element already does something of its own. An
 * element marked `data-shortcut-passthrough` (an outcome button, which the
 * agent has usually just clicked) hands Enter to the workspace instead of
 * pressing itself again.
 */
function isActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (isTypingTarget(target)) return true;
  if (target.closest("[data-shortcut-passthrough]")) return false;
  if (target.tagName === "BUTTON" || target.tagName === "A") return true;
  const role = target.getAttribute("role");
  return role !== null && ACTIVATION_ROLES.has(role);
}

/**
 * Whether a workspace shortcut may act on this key press. `activation` keys
 * (Enter, S) also yield to a focused button or link, so one press never does
 * two things; digits only yield to a text field.
 */
export function shortcutAllowed(
  event: KeyboardEvent,
  kind: "digit" | "activation",
): boolean {
  if (event.defaultPrevented || event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  // A confirmation (ending the session, say) owns the keyboard while open.
  if (document.querySelector('[role="alertdialog"]')) return false;
  // So does a popover the agent is working in — the call keypad: a digit typed
  // while tones are being sent must not pick an outcome.
  if (
    event.target instanceof Element &&
    event.target.closest('[data-slot="popover-content"]')
  ) {
    return false;
  }
  return kind === "digit"
    ? !isTypingTarget(event.target)
    : !isActivationTarget(event.target);
}
