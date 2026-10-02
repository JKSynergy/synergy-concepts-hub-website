/**
 * Railway project webhook adapter (documented mechanism).
 *
 * Railway webhooks are configured per project and send JSON POSTs for
 * deployment status changes and monitor/alert events. Railway documents no
 * signing scheme — the only authentication available is that the configured
 * URL is unguessable. SCH therefore authenticates via a per-account random
 * URL token: /api/provider-events/railway/<token>.
 *
 * Railway explicitly documents at-least-once delivery and no ordering
 * guarantee — dedupe and reconcile-rather-than-apply handle both.
 */

import type {
  NormalizedEventType, ParsedProviderEvent, ProviderEventAdapter,
} from "./types";
import { asRecord, isoToDate, safeTokenEqual, str } from "./types";

const TYPE_MAP: Record<string, NormalizedEventType> = {
  DEPLOY: "deployment_started",
  DEPLOY_STARTED: "deployment_started",
  DEPLOY_COMPLETED: "deployment_succeeded",
  DEPLOY_FAILED: "deployment_failed",
  DEPLOY_CRASHED: "deployment_failed",
  DEPLOY_REMOVED: "resource_deleted",
};

const STATUS_MAP: Record<string, NormalizedEventType> = {
  SUCCESS: "deployment_succeeded",
  FAILED: "deployment_failed",
  CRASHED: "deployment_failed",
  REMOVED: "resource_deleted",
};

export const railwayEventAdapter: ProviderEventAdapter = {
  key: "railway",
  authType: "url_token",

  extractCredential(_headers, urlToken) {
    return urlToken ?? null;
  },

  verify(_rawBody, credential, secret) {
    return safeTokenEqual(credential, secret);
  },

  parse(body): ParsedProviderEvent {
    const root = asRecord(body);
    if (!root) throw new Error("invalid_payload_shape");
    const type = str(root.type);
    if (!type) throw new Error("missing_event_type");

    const project = asRecord(root.project);
    const service = asRecord(root.service);
    const deployment = asRecord(root.deployment);
    const status = str(deployment?.status);

    const normalized =
      TYPE_MAP[type] ??
      (type.startsWith("DEPLOY") && status ? STATUS_MAP[status] : undefined) ??
      (type.startsWith("DEPLOY") ? "deployment_started" : "account_event");

    const externalIds = [str(service?.id), str(project?.id)]
      .filter((v): v is string => Boolean(v));

    return {
      // Railway sends no event id — the fingerprint dedupe covers retries.
      providerEventId: str(root.id),
      eventType: type,
      normalizedType: normalized,
      occurredAt: isoToDate(root.timestamp) ?? isoToDate(root.created_at),
      externalResourceIds: [...new Set(externalIds)],
      summary: {
        summary: `Railway ${type}${str(service?.name) ? ` on ${str(service?.name)}` : ""}${status ? ` (${status})` : ""}`,
        projectId: str(project?.id),
        serviceId: str(service?.id),
        deploymentStatus: status,
      },
    };
  },
};
