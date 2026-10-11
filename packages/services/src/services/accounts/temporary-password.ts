import { randomInt } from "node:crypto";

/*
 * The password is read off an email and typed by hand, so look-alikes (0/O,
 * 1/l/I) are left out, and so is anything an email client or HTML could mangle
 * (<, >, &, quotes, spaces).
 */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%*+-=?@";

export const TEMPORARY_PASSWORD_LENGTH = 16;

/**
 * The password of a login Ringee creates (LIFE-005): drawn from a
 * cryptographic source, with at least one character of each class so it
 * passes whatever password policy Clerk is set to enforce.
 */
export function generateTemporaryPassword(
  length = TEMPORARY_PASSWORD_LENGTH,
): string {
  const classes = [LOWER, UPPER, DIGITS, SYMBOLS];
  const everything = classes.join("");
  const chars = classes.map(pick);
  while (chars.length < length) chars.push(pick(everything));

  // Shuffled, so the guaranteed characters are not always the first four.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const swap = chars[i];
    chars[i] = chars[j];
    chars[j] = swap;
  }
  return chars.join("");
}

function pick(alphabet: string): string {
  return alphabet.charAt(randomInt(alphabet.length));
}
