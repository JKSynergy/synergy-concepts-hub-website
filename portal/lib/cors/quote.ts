// CORS helper for the public quote endpoint served by the Portal but called
// from the marketing site. Restricts the allowed origin to the configured
// marketing site origin; falls back to the request origin in dev/tests; uses
// wildcard only as a last resort.
export function quoteCorsHeaders(origin: string | null): Record<string, string> {
  const configured = process.env.MARKETING_SITE_ORIGIN;
  const allowOrigin = configured?.trim() || origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
