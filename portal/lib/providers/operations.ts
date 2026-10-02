/**
 * Phase 3G-3 — provider operation catalogue.
 *
 * The single shared definition of which typed operations exist and which
 * (provider, resource type) pairs support them. Server actions, RLS-adjacent
 * checks and the UI all read from here — there is no arbitrary operation
 * vocabulary anywhere else.
 *
 * An entry absent from `providerSupport` means NOT_SUPPORTED — never simulated.
 */

import type { NormalizedResourceType, ProviderKey, ProviderOperationKey } from "./types.ts";

export interface ProviderOperationDef {
  label: string;
  description: string;
  /** Lifecycle direction this operation drives the external resource toward. */
  direction: "down" | "up";
  providerSupport: Partial<Record<ProviderKey, NormalizedResourceType[]>>;
}

export const PROVIDER_OPERATION_DEFS: Record<ProviderOperationKey, ProviderOperationDef> = {
  pause_resource: {
    label: "Pause resource",
    description: "Suspend the external resource at the provider (reversible)",
    direction: "down",
    providerSupport: {
      supabase: ["project"],
    },
  },
  resume_resource: {
    label: "Resume resource",
    description: "Resume a paused external resource at the provider",
    direction: "up",
    providerSupport: {
      supabase: ["project"],
    },
  },
};

export const PROVIDER_OPERATION_KEYS = Object.keys(PROVIDER_OPERATION_DEFS) as ProviderOperationKey[];

export function isProviderOperationKey(v: unknown): v is ProviderOperationKey {
  return typeof v === "string" && PROVIDER_OPERATION_KEYS.includes(v as ProviderOperationKey);
}

/** Catalogue-level support check — the adapter additionally enforces it. */
export function providerSupportsOperation(
  providerKey: string | null | undefined,
  operation: ProviderOperationKey,
  resourceType: string
): boolean {
  const def = PROVIDER_OPERATION_DEFS[operation];
  if (!def || !providerKey) return false;
  const types = def.providerSupport[providerKey as ProviderKey];
  return !!types && types.includes(resourceType as NormalizedResourceType);
}
