// CORS helper for the public quote endpoints served by the Portal but called
// from the marketing site.
//
// MARKETING_SITE_ORIGIN lists the approved marketing-site origins, comma
// separated (for example "https://synergyconceptshub.com,https://www.synergyconceptshub.com").
// A request from an approved origin gets that origin back; any other origin
// gets the first approved one (so the browser blocks it). Without a configured
// value (local development, tests) the request origin is allowed, and wildcard
// is used only as a last resort.
export function allowedMarketingOrigins(): string[] {
  return (process.env.MARKETING_SITE_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function quoteCorsHeaders(origin: string | null, methods = "POST, OPTIONS"): Record<string, string> {
  const allowed = allowedMarketingOrigins();
  let allowOrigin: string;
  if (allowed.length) {
    allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  } else {
    allowOrigin = origin || "*";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
