export function getPortalOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function getPortalBaseUrl(): string {
  return process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export function getInviteRedirectUrl(request: Request): string {
  return `${getPortalOrigin(request)}/auth/callback`;
}

export function getInviteRedirectUrlFromEnv(): string {
  return `${getPortalBaseUrl()}/auth/callback`;
}
