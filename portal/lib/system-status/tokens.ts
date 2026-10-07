import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateStatusToken(): string {
  // 64 random bytes, URL-safe base64url.
  return randomBytes(64)
    .toString("base64url")
    .replace(/=/g, "");
}

export function hashStatusToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeCompareHashes(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
