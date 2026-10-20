// sendEmail reports what happened (sent / skipped / failed) so no caller can
// claim a client was notified when nothing went out. fetch is mocked: no
// real email is ever sent from tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../lib/email/notify.ts";

const args = { to: "client@example.test", subject: "Invoice", html: "<p>hi</p>" };

async function withEnv<T>(key: string | undefined, fetchImpl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFetch = globalThis.fetch;
  const prevLog = console.log;
  const prevErr = console.error;
  if (key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = key;
  globalThis.fetch = fetchImpl;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    globalThis.fetch = prevFetch;
    console.log = prevLog;
    console.error = prevErr;
  }
}

test("no RESEND_API_KEY: skipped, and nothing is sent", async () => {
  let calls = 0;
  const r = await withEnv(undefined, (async () => { calls++; return new Response("{}"); }) as typeof fetch, () => sendEmail(args));
  assert.deepEqual(r, { status: "skipped" });
  assert.equal(calls, 0);
});

test("provider error: failed, with the HTTP status only (no body, no address)", async () => {
  const r = await withEnv("re_test", (async () => new Response("bad", { status: 422 })) as typeof fetch, () => sendEmail(args));
  assert.deepEqual(r, { status: "failed", error: "HTTP 422" });
});

test("network error: failed", async () => {
  const r = await withEnv("re_test", (async () => { throw new Error("down"); }) as typeof fetch, () => sendEmail(args));
  assert.deepEqual(r, { status: "failed", error: "network" });
});

test("accepted by the provider: sent", async () => {
  const r = await withEnv("re_test", (async () => new Response("{}", { status: 200 })) as typeof fetch, () => sendEmail(args));
  assert.deepEqual(r, { status: "sent" });
});
