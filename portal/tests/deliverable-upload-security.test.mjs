import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DELIVERABLE_ALLOWED_MIME_TYPES,
  DELIVERABLE_MAX_BYTES,
  validateDeliverableFile,
  validateDeliverableLabel,
} from "../lib/deliverables.ts";
import {
  createDeliverableUploadIntent,
  DELIVERABLE_INTENT_TTL_MS,
  DELIVERABLE_ORPHAN_MIN_AGE_MS,
  isDeliverableOrphanCandidate,
  verifyDeliverableUploadIntent,
  verifyUploadedObject,
} from "../lib/security/deliverable-upload-intent.ts";
import { createDb } from "./helpers/db.mjs";

const USER = "00000000-0000-0000-0000-0000000000a1";
const OTHER_USER = "00000000-0000-0000-0000-0000000000b1";
const PROJECT = "10000000-0000-0000-0000-000000000001";
const OTHER_PROJECT = "20000000-0000-0000-0000-000000000002";
const PATH = `${PROJECT}/550e8400-e29b-41d4-a716-446655440000-proof.pdf`;
const SECRET = "test-only-secret-with-sufficient-entropy";
const NOW = 1_700_000_000_000;

function intent(overrides = {}) {
  return createDeliverableUploadIntent({
    userId: USER,
    projectId: PROJECT,
    path: PATH,
    fileSize: 1234,
    contentType: "application/pdf",
    ...overrides,
  }, SECRET, NOW);
}

test("file policy accepts common creative deliverables and rejects dangerous, oversized, or empty files", () => {
  assert.deepEqual(validateDeliverableFile({ fileName: "campaign.psd", fileSize: 1024, fileType: "application/x-photoshop" }), { contentType: "image/vnd.adobe.photoshop" });
  assert.deepEqual(validateDeliverableFile({ fileName: "brand.ai", fileSize: 1024, fileType: "application/illustrator" }), { contentType: "application/pdf" });
  assert.deepEqual(validateDeliverableFile({ fileName: "print.eps", fileSize: 1024, fileType: "image/x-eps" }), { contentType: "application/postscript" });
  assert.deepEqual(validateDeliverableFile({ fileName: "layout.indd", fileSize: 1024, fileType: "application/x-indesign" }), { contentType: "application/octet-stream" });
  assert.deepEqual(validateDeliverableFile({ fileName: "audio.wav", fileSize: 1024, fileType: "audio/x-wav" }), { contentType: "audio/wav" });
  assert.deepEqual(validateDeliverableFile({ fileName: "archive.rar", fileSize: 1024, fileType: "application/x-rar-compressed" }), { contentType: "application/vnd.rar" });
  assert.match(validateDeliverableFile({ fileName: "page.html", fileSize: 10, fileType: "text/html" }).error, /not allowed/);
  assert.match(validateDeliverableFile({ fileName: "fake.pdf", fileSize: 10, fileType: "text/html" }).error, /not allowed/);
  assert.match(validateDeliverableFile({ fileName: "run.exe", fileSize: 10, fileType: "application/octet-stream" }).error, /not allowed/);
  assert.match(validateDeliverableFile({ fileName: "proof.pdf", fileSize: 0, fileType: "application/pdf" }).error, /non-empty/);
  assert.match(validateDeliverableFile({ fileName: "proof.pdf", fileSize: DELIVERABLE_MAX_BYTES + 1, fileType: "application/pdf" }).error, /50 MB/);
});

test("display names have bounded, printable content", () => {
  assert.equal(validateDeliverableLabel(" Final proof "), "Final proof");
  assert.equal(validateDeliverableLabel(""), null);
  assert.equal(validateDeliverableLabel("bad\u0000name"), null);
  assert.equal(validateDeliverableLabel("x".repeat(181)), null);
});

test("upload intent binds caller, project, exact path, size, type, and expiry", () => {
  const token = intent();
  const ok = verifyDeliverableUploadIntent(token, SECRET, { userId: USER, projectId: PROJECT, now: NOW });
  assert.equal(ok.error, undefined);
  assert.equal(ok.intent?.path, PATH);
  assert.equal(ok.intent?.fileSize, 1234);
  assert.equal(ok.intent?.contentType, "application/pdf");

  assert.match(verifyDeliverableUploadIntent(token, SECRET, { userId: OTHER_USER, projectId: PROJECT, now: NOW }).error, /Invalid/);
  assert.match(verifyDeliverableUploadIntent(token, SECRET, { userId: USER, projectId: OTHER_PROJECT, now: NOW }).error, /Invalid/);
  assert.match(verifyDeliverableUploadIntent(`${token}x`, SECRET, { userId: USER, projectId: PROJECT, now: NOW }).error, /Invalid/);
  assert.match(verifyDeliverableUploadIntent(token, SECRET, { userId: USER, projectId: PROJECT, now: NOW + DELIVERABLE_INTENT_TTL_MS + 1 }).error, /expired/);
});

test("upload intent rejects traversal and cross-project paths even with a valid signature", () => {
  for (const path of [`${PROJECT}/../escape.pdf`, `${OTHER_PROJECT}/proof.pdf`, `/${PROJECT}/proof.pdf`]) {
    const token = intent({ path });
    assert.match(verifyDeliverableUploadIntent(token, SECRET, { userId: USER, projectId: PROJECT, now: NOW }).error, /Invalid/);
  }
});

test("authoritative object metadata must match the prepared upload", () => {
  const prepared = verifyDeliverableUploadIntent(intent(), SECRET, { userId: USER, projectId: PROJECT, now: NOW }).intent;
  assert.ok(prepared);
  assert.deepEqual(verifyUploadedObject(prepared, {
    bucketId: "deliverables", name: PATH, size: 1234, contentType: "application/pdf",
  }), { fileSize: 1234, contentType: "application/pdf" });
  assert.match(verifyUploadedObject(prepared, null).error, /not found/);
  assert.match(verifyUploadedObject(prepared, { bucketId: "other", name: PATH, size: 1234, contentType: "application/pdf" }).error, /not found/);
  assert.match(verifyUploadedObject(prepared, { bucketId: "deliverables", name: `${PROJECT}/other.pdf`, size: 1234, contentType: "application/pdf" }).error, /not found/);
  assert.match(verifyUploadedObject(prepared, { bucketId: "deliverables", name: PATH, size: 9999, contentType: "application/pdf" }).error, /metadata/);
  assert.match(verifyUploadedObject(prepared, { bucketId: "deliverables", name: PATH, size: 1234, contentType: "text/plain" }).error, /metadata/);
});

test("orphan reconciliation waits 24 hours and excludes registered or malformed objects", () => {
  const createdAt = new Date(NOW).toISOString();
  const base = { projectId: PROJECT, path: PATH, createdAt, hasRegistration: false };
  assert.equal(isDeliverableOrphanCandidate({ ...base, now: NOW + DELIVERABLE_ORPHAN_MIN_AGE_MS - 1 }), false);
  assert.equal(isDeliverableOrphanCandidate({ ...base, now: NOW + DELIVERABLE_ORPHAN_MIN_AGE_MS }), true);
  assert.equal(isDeliverableOrphanCandidate({ ...base, hasRegistration: true, now: NOW + DELIVERABLE_ORPHAN_MIN_AGE_MS }), false);
  assert.equal(isDeliverableOrphanCandidate({ ...base, path: `${PROJECT}/../escape.pdf`, now: NOW + DELIVERABLE_ORPHAN_MIN_AGE_MS }), false);
  assert.equal(isDeliverableOrphanCandidate({ ...base, createdAt: "invalid", now: NOW + DELIVERABLE_ORPHAN_MIN_AGE_MS }), false);
});

test("server actions retain security checks and never delete Storage objects on request paths", () => {
  const actions = readFileSync(new URL("../lib/actions/projects.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/deliverables-section.tsx", import.meta.url), "utf8");
  assert.match(actions, /prepareDeliverableUpload[\s\S]*?!user \|\| !isStaff/);
  assert.match(actions, /registerDeliverable[\s\S]*?!user \|\| !isStaff/);
  assert.match(actions, /canAccessProject\(supabase, projectId\)/);
  assert.match(actions, /storage\.from\("deliverables"\)\.info\(intent\.path\)/);
  assert.match(actions, /eq\("file_url", intent\.path\)\.maybeSingle\(\)/);
  assert.doesNotMatch(actions, /storage\.from\("deliverables"\)\.remove\(/);
  assert.doesNotMatch(actions, /discardPreparedDeliverable/);
  assert.doesNotMatch(component, /discardPreparedDeliverable/);
  assert.match(actions, /getDeliverableDownloadUrl[\s\S]*?\.from\("deliverables"\)[\s\S]*?\.createSignedUrl\(path, 60 \* 5\)/);
});

test("migration 035 prevents duplicate registrations and configures the private bucket ceiling", async () => {
  const db = await createDb();
  const bucket = (await db.query("SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='deliverables'")).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), DELIVERABLE_MAX_BYTES);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), [...DELIVERABLE_ALLOWED_MIME_TYPES].sort());

  const index = await db.query("SELECT indexdef FROM pg_indexes WHERE indexname='uq_deliverables_file_url'");
  assert.equal(index.rows.length, 1);
  assert.match(index.rows[0].indexdef, /UNIQUE/);
  assert.match(index.rows[0].indexdef, /file_url IS NOT NULL/);

  const migration = readFileSync(new URL("../supabase/migrations/035_deliverable_upload_hardening.sql", import.meta.url), "utf8");
  assert.match(migration, /allowed_mime_types @> v_allowed/);
  assert.match(migration, /v_allowed @> allowed_mime_types/);
});

test("migration 035 rejects a same-named index with a different definition", async () => {
  const db = await createDb({ upTo: "034_booking_delete_admin.sql" });
  await db.exec("CREATE INDEX uq_deliverables_file_url ON public.deliverables (name)");
  const migration = readFileSync(new URL("../supabase/migrations/035_deliverable_upload_hardening.sql", import.meta.url), "utf8");
  await assert.rejects(db.exec(migration), /exists with an unexpected definition/);
});
