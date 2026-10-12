import { createHmac, timingSafeEqual } from "node:crypto";
import { deliverableStoragePath, isUuid } from "./access.ts";

export const DELIVERABLE_INTENT_TTL_MS = 30 * 60 * 1000;
export const DELIVERABLE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type DeliverableUploadIntent = {
  v: 1;
  userId: string;
  projectId: string;
  path: string;
  fileSize: number;
  contentType: string;
  expiresAt: number;
};

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update("sch-deliverable-upload-v1\0").update(encodedPayload).digest();
}

export function createDeliverableUploadIntent(
  input: Omit<DeliverableUploadIntent, "v" | "expiresAt">,
  secret: string,
  now = Date.now()
): string {
  const payload: DeliverableUploadIntent = { ...input, v: 1, expiresAt: now + DELIVERABLE_INTENT_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyDeliverableUploadIntent(
  token: string,
  secret: string,
  options: { userId: string; projectId: string; now?: number }
): { intent?: DeliverableUploadIntent; error?: string } {
  if (typeof token !== "string" || token.length > 4096) return { error: "Invalid upload intent" };
  const [encoded, encodedSignature, extra] = token.split(".");
  if (!encoded || !encodedSignature || extra) return { error: "Invalid upload intent" };

  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, "base64url");
  } catch {
    return { error: "Invalid upload intent" };
  }
  const expected = signature(encoded, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { error: "Invalid upload intent" };

  let intent: DeliverableUploadIntent;
  try {
    intent = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DeliverableUploadIntent;
  } catch {
    return { error: "Invalid upload intent" };
  }

  const path = deliverableStoragePath({ project_id: intent.projectId, file_url: intent.path });
  if (
    intent.v !== 1 ||
    !isUuid(intent.userId) ||
    !isUuid(intent.projectId) ||
    intent.userId !== options.userId ||
    intent.projectId !== options.projectId ||
    !path ||
    !Number.isSafeInteger(intent.fileSize) ||
    intent.fileSize <= 0 ||
    typeof intent.contentType !== "string" ||
    !Number.isSafeInteger(intent.expiresAt)
  ) return { error: "Invalid upload intent" };

  const now = options.now ?? Date.now();
  if (intent.expiresAt < now) return { error: "Upload intent expired" };
  return { intent };
}

// Reconciliation is deliberately delayed beyond both the 30-minute app intent
// and Supabase's two-hour signed-upload lifetime. This helper only classifies
// candidates; it never deletes. A future reconciler must still confirm there is
// no deliverables row immediately before handling an exact object path.
export function isDeliverableOrphanCandidate(input: {
  projectId: string;
  path: string;
  createdAt: string;
  hasRegistration: boolean;
  now?: number;
}): boolean {
  if (input.hasRegistration || !deliverableStoragePath({ project_id: input.projectId, file_url: input.path })) return false;
  const createdAt = Date.parse(input.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  return (input.now ?? Date.now()) - createdAt >= DELIVERABLE_ORPHAN_MIN_AGE_MS;
}

export function verifyUploadedObject(
  intent: DeliverableUploadIntent,
  object: { bucketId?: string; name?: string; size?: number; contentType?: string } | null
): { fileSize?: number; contentType?: string; error?: string } {
  if (!object || object.bucketId !== "deliverables" || object.name !== intent.path) {
    return { error: "Uploaded file was not found" };
  }
  const contentType = (object.contentType || "").toLowerCase().split(";", 1)[0];
  if (object.size !== intent.fileSize || contentType !== intent.contentType) {
    return { error: "Uploaded file metadata does not match the prepared upload" };
  }
  return { fileSize: object.size, contentType };
}
