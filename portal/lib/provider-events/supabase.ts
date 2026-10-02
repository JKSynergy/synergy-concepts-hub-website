/**
 * Supabase Management API webhook adapter (documented mechanism).
 *
 * Management API v2 webhook endpoints support `custom_headers`; SCH supplies
 * `Authorization: Bearer <token>` there and verifies it here. Supabase
 * delivers project-lifecycle events such as `v1.project.paused`.
 */

import type {
  NormalizedEventType, ParsedProviderEvent, ProviderEventAdapter,
} from "./types";
import { asRecord, isoToDate, safeTokenEqual, str } from "./types";

const TYPE_MAP: Record<string, NormalizedEventType> = {
  "v1.project.paused": "resource_unavailable",
  "v1.project.restored": "resource_recovered",
  "v1.project.resumed": "resource_recovered",
  "v1.project.created": "resource_created",
  "v1.project.deleted": "resource_deleted",
  "v1.project.updated": "configuration_changed",
};

export const supabaseEventAdapter: ProviderEventAdapter = {
  key: "supabase",
  authType: "bearer_token",

  extractCredential(headers) {
    const auth = headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  },

  verify(_rawBody, credential, secret) {
    return safeTokenEqual(credential, secret);
  },

  parse(body): ParsedProviderEvent {
    const root = asRecord(body);
    if (!root) throw new Error("invalid_payload_shape");
    const payload = asRecord(root.payload);
    const type = str(root.type) ?? str(payload?.type);
    if (!type) throw new Error("missing_event_type");

    const projectRef =
      str(payload?.project_ref) ?? str(payload?.projectRef) ??
      str(asRecord(payload?.project)?.id) ?? str(payload?.id);

    return {
      providerEventId: str(root.id) ?? str(payload?.id) ?? str(root.event_id),
      eventType: type,
      normalizedType: TYPE_MAP[type] ?? "unknown",
      occurredAt: isoToDate(root.timestamp) ?? isoToDate(root.created_at)
        ?? isoToDate(payload?.timestamp),
      externalResourceIds: projectRef ? [projectRef] : [],
      summary: {
        summary: `Supabase ${type}${projectRef ? ` on ${projectRef}` : ""}`,
        projectRef,
      },
    };
  },
};
