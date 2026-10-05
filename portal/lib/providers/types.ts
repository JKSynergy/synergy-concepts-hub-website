/**
 * Phase 3G-1 — Provider adapter contract.
 *
 * READ-ONLY ONLY. The adapter interface intentionally exposes no mutation
 * methods. `capabilities` is declared per adapter and surfaced to the UI so a
 * provider can never appear to support write operations it does not have.
 */

export type ProviderKey = "supabase" | "railway" | "vercel" | "cloudflare";

/** Normalized, provider-agnostic error categories — safe to persist/display. */
export type ConnectionErrorCategory =
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "malformed_response"
  | "network_error"
  | "no_adapter"
  | "no_credentials";

export type NormalizedResourceType =
  | "workspace"
  | "project"
  | "environment"
  | "service"
  | "database"
  | "zone"
  | "hosting"
  | "storage"
  | "deployment"
  | "other";

export interface ProviderCapabilities {
  discoverResources: boolean;
  readResourceMetadata: boolean;
  /** Infrastructure creation is never supported. */
  create: false;
  /** Arbitrary config mutation is never supported. */
  update: false;
  delete: false;
  /** Lifecycle operations only — pause_resource / resume_resource (3G-3). */
  suspend: boolean;
  restore: boolean;
  billing: false;
}

export interface ProviderCredentials {
  /** Bearer/API token. Never persisted outside Vault, never logged. */
  token: string;
  /** Optional provider account/workspace identifier (e.g. Cloudflare account). */
  accountId?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: ConnectionErrorCategory;
  /** Short, secret-free human message — normalized, never a raw provider payload. */
  message?: string;
}

export interface DiscoveredResource {
  externalId: string;
  type: NormalizedResourceType;
  name: string;
  status?: string;
  region?: string;
  url?: string;
  /** Normalized operational fields only — never raw API payloads. */
  metadata?: Record<string, unknown>;
}

export interface DiscoveryResult {
  ok: boolean;
  error?: ConnectionErrorCategory;
  message?: string;
  resources: DiscoveredResource[];
}

// ============================================================================
// Phase 3G-3 — Controlled provider operations (typed capabilities, not CRUD)
// ============================================================================

/** Closed vocabulary of provider-side operations. */
export type ProviderOperationKey = "pause_resource" | "resume_resource";

/**
 * Normalized provider result categories. `success`/`accepted` mean the provider
 * acknowledged the request — post-operation verification still decides the
 * final state. `execution_unknown` means a timeout/transport failure where the
 * provider may have applied the change — never treated as success.
 */
export type ProviderOperationResultCategory =
  | "success"
  | "accepted"
  | "already_in_desired_state"
  | "not_found"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "invalid_request"
  | "conflict"
  | "network_error"
  | "malformed_response"
  | "execution_unknown"
  | "no_credentials"
  | "unsupported";

export interface ProviderOperationRequest {
  creds: ProviderCredentials;
  operation: ProviderOperationKey;
  /** Stable external identity — the linked provider resource. */
  externalResourceId: string;
  resourceType: NormalizedResourceType;
  /** Stable per proposal; used where the provider supports idempotency. */
  idempotencyKey: string;
}

export interface ProviderOperationResult {
  category: ProviderOperationResultCategory;
  /** Optional safe provider-side reference (e.g. operation id). Never raw payloads. */
  providerReference?: string;
  /** Short secret-free message. */
  message?: string;
}

/** Whether the provider now reports the resource in the operation's target state. */
export interface ProviderVerificationResult {
  outcome: "verified" | "pending" | "mismatch" | "unknown";
  /** Normalized provider-reported status string (e.g. ACTIVE_HEALTHY). */
  observedStatus?: string;
}

export interface ProviderOperationAdapter {
  /** True only for explicitly implemented (operation, resourceType) pairs. */
  supportsOperation(operation: ProviderOperationKey, resourceType: NormalizedResourceType): boolean;
  executeOperation(req: ProviderOperationRequest): Promise<ProviderOperationResult>;
  verifyOperation(req: ProviderOperationRequest): Promise<ProviderVerificationResult>;
}

export interface ProviderAdapter {
  key: ProviderKey;
  label: string;
  capabilities: ProviderCapabilities;
  testConnection(creds: ProviderCredentials): Promise<ConnectionTestResult>;
  discoverResources(creds: ProviderCredentials): Promise<DiscoveryResult>;
  /**
   * Provider-side operations (3G-3). Absent = the provider exposes NO
   * operations. `capabilities` alone never implies mutation support.
   */
  operations?: ProviderOperationAdapter;
}
