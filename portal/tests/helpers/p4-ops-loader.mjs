// ESM resolve hooks for the provider-operations behavioral tests.
// Redirects the action's external dependencies to test stubs and maps the
// TypeScript "@/" path alias to real files so plain Node can load them.
// Runs in the module-hooks worker thread — must stay self-contained.

const ROOT = new URL("../../", import.meta.url); // portal/

const STUBS = new Map(Object.entries({
  "next/cache": "tests/helpers/stub-next-cache.mjs",
  "@/lib/supabase/server": "tests/helpers/stub-supabase-server.mjs",
  "@/lib/supabase/admin": "tests/helpers/stub-supabase-admin.mjs",
  "@/lib/providers/registry": "tests/helpers/stub-registry.mjs",
}));

export async function resolve(specifier, context, next) {
  if (STUBS.has(specifier)) {
    return { url: new URL(STUBS.get(specifier), ROOT).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    return { url: new URL(specifier.slice(2) + ".ts", ROOT).href, shortCircuit: true };
  }
  return next(specifier, context);
}
