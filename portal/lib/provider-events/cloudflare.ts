/**
 * Cloudflare webhook adapter (documented mechanism).
 *
 * Auth: Cloudflare sends the configured webhook secret verbatim in the
 * `cf-webhook-auth` header (shared-secret header for generic webhook
 * destinations). Payloads are notification envelopes whose `data` shape
 * varies per alert type.
 */

import type {
  NormalizedEventType, ParsedProviderEvent, ProviderEventAdapter,
} from "./types";
import { asRecord, isoToDate, safeTokenEqual, str } from "./types";

const TYPE_MAP: Record<string, NormalizedEventType> = {
  health_check_status_notification: "resource_state_changed",
  origin_health_status_notification: "resource_state_changed",
  pool_enablement: "resource_state_changed",
  g6_pool_toggle_alert: "resource_state_changed",
  ssl_custom_cert_expiration_type: "configuration_changed",
  universal_ssl_event_type: "configuration_changed",
};

export const cloudflareEventAdapter: ProviderEventAdapter = {
  key: "cloudflare",
  authType: "header_secret",

  extractCredential(headers) {
    return headers.get("cf-webhook-auth");
  },

  verify(_rawBody, credential, secret) {
    return safeTokenEqual(credential, secret);
  },

  parse(body): ParsedProviderEvent {
    const root = asRecord(body);
    if (!root) throw new Error("invalid_payload_shape");
    const alertType =
      str(root.alert_type) ?? str(root.alertType) ?? str(root.type);
    const data = asRecord(root.data);

    // Zones are the discovered resource type; pull whichever id the alert
    // shape carries, without trusting arbitrary caller-supplied linkage.
    const zone = asRecord(data?.zone);
    const externalIds = [
      str(data?.zone_id), str(zone?.id), str(data?.pool_id),
    ].filter((v): v is string => Boolean(v));

    return {
      providerEventId: str(root.id) ?? str(root.notification_id),
      eventType: alertType ?? "cloudflare.notification",
      normalizedType: (alertType && TYPE_MAP[alertType]) || "account_event",
      occurredAt: isoToDate(root.ts) ?? isoToDate(root.created_at)
        ?? isoToDate(data?.timestamp),
      externalResourceIds: [...new Set(externalIds)],
      summary: {
        summary: `Cloudflare ${alertType ?? "notification"}`,
        alertType,
      },
    };
  },
};
