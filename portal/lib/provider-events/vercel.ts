/**
 * Vercel webhook adapter (documented mechanism).
 *
 * Auth: `x-vercel-signature` header = HMAC-SHA1 hex of the exact raw body,
 * keyed by the webhook secret shown once at webhook creation.
 * Payload: { id, type, createdAt (ms epoch), payload: {...} }.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  NormalizedEventType, ParsedProviderEvent, ProviderEventAdapter,
} from "./types";
import { asRecord, epochMsToDate, safeTokenEqual, str } from "./types";

const TYPE_MAP: Record<string, NormalizedEventType> = {
  "deployment.created": "deployment_started",
  "deployment.succeeded": "deployment_succeeded",
  "deployment.ready": "deployment_succeeded",
  "deployment.error": "deployment_failed",
  "deployment.canceled": "deployment_failed",
  "project.created": "resource_created",
  "project.removed": "resource_deleted",
  "project.updated": "configuration_changed",
  "domain.created": "configuration_changed",
  "domain.deleted": "configuration_changed",
};

export const vercelEventAdapter: ProviderEventAdapter = {
  key: "vercel",
  authType: "vercel_hmac_sha1",

  extractCredential(headers) {
    return headers.get("x-vercel-signature");
  },

  verify(rawBody, credential, secret) {
    const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
    return safeTokenEqual(expected, credential.toLowerCase());
  },

  parse(body): ParsedProviderEvent {
    const root = asRecord(body);
    if (!root) throw new Error("invalid_payload_shape");
    const type = str(root.type);
    if (!type) throw new Error("missing_event_type");

    const payload = asRecord(root.payload);
    const project = asRecord(payload?.project);
    const deployment = asRecord(payload?.deployment);
    const deploymentProject = asRecord(deployment?.project);

    const externalIds = [
      str(project?.id),
      str(deploymentProject?.id),
      str(deployment?.projectId),
    ].filter((v): v is string => Boolean(v));

    return {
      providerEventId: str(root.id),
      eventType: type,
      normalizedType: TYPE_MAP[type] ?? "unknown",
      occurredAt: epochMsToDate(root.createdAt),
      externalResourceIds: [...new Set(externalIds)],
      summary: {
        summary: `Vercel ${type}${str(project?.name) ? ` on ${str(project?.name)}` : ""}`,
        projectId: str(project?.id),
        deploymentId: str(deployment?.id),
      },
    };
  },
};
