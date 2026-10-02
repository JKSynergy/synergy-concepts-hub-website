/**
 * Phase 3G-5 — provider event adapters.
 *
 * Each provider has a separate, narrow ingestion contract:
 *
 *   extractCredential  → read the provider's auth material from the request
 *   verify             → check it against the Vault-held secret
 *   parse              → normalize the authenticated payload into the
 *                        provider-neutral event vocabulary
 *
 * Adapters never receive or return the secret beyond the verification step,
 * and parse() returns ONLY a minimized summary — the raw provider payload is
 * never stored.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { ProviderKey } from "@/lib/providers/types";

export type NormalizedEventType =
  | "resource_created" | "resource_updated" | "resource_deleted"
  | "resource_state_changed" | "resource_unavailable" | "resource_recovered"
  | "deployment_started" | "deployment_succeeded" | "deployment_failed"
  | "backup_succeeded" | "backup_failed"
  | "account_event" | "configuration_changed" | "unknown";

/** Mirrors the provider_webhook_configs.auth_type vocabulary. */
export type WebhookAuthType =
  | "vercel_hmac_sha1"   // signature header over raw body
  | "bearer_token"     // Authorization: Bearer <configured token>
  | "header_secret"    // provider-specific shared-secret header
  | "url_token";       // unguessable per-account path token

export interface ParsedProviderEvent {
  providerEventId?: string;
  eventType: string;
  normalizedType: NormalizedEventType;
  occurredAt?: Date;
  /** Authoritative external ids for resource matching (never names). */
  externalResourceIds: string[];
  /** Minimized, secret-safe fields persisted as evidence. */
  summary: Record<string, unknown>;
}

export interface ProviderEventAdapter {
  key: ProviderKey;
  authType: WebhookAuthType;
  /** Extract the presented credential (signature or token), or null. */
  extractCredential(headers: Headers, urlToken?: string): string | null;
  /** Verify the presented credential against the stored secret. */
  verify(rawBody: Buffer, credential: string, secret: string): boolean;
  /** Normalize the authenticated payload. Throws on malformed shape. */
  parse(body: unknown): ParsedProviderEvent;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time comparison for token-class credentials. */
export function safeTokenEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Strict-but-tolerant string reader for defensive payload parsing. */
export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length < 512 ? v : undefined;
}

export function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

export function epochMsToDate(v: unknown): Date | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function isoToDate(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
