// ESM resolve hooks for the /api/quote route tests: the real route handlers run
// against PGlite (migrations applied) through a small service-role stand-in,
// and outgoing email is captured instead of sent. No network.
const ROOT = new URL("../../", import.meta.url); // portal/

const STUBS = new Map(Object.entries({
  "@/lib/supabase/admin": "tests/helpers/stub-quote-admin.mjs",
  "@/lib/email/notify": "tests/helpers/stub-quote-email.mjs",
}));

export async function resolve(specifier, context, next) {
  if (STUBS.has(specifier)) {
    return { url: new URL(STUBS.get(specifier), ROOT).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    return { url: new URL(specifier.slice(2) + ".ts", ROOT).href, shortCircuit: true };
  }
  if (specifier === "next/server") {
    return next("next/server.js", context);
  }
  return next(specifier, context);
}
