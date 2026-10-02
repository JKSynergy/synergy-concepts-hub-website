import { randomInt } from "node:crypto";

// Cryptographically secure temporary password (replaces the Math.random copies
// that lived in two API routes). 14 characters, mixed case, digits and a symbol.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";

const pick = (set: string) => set[randomInt(set.length)];

export function generateTempPassword(): string {
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  for (let i = 0; i < 10; i++) chars.push(pick(all));
  // Fisher-Yates shuffle with a secure RNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
