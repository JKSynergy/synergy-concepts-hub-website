import type { ProviderKey } from "@/lib/providers/types";
import type { ProviderEventAdapter } from "./types";
import { supabaseEventAdapter } from "./supabase";
import { railwayEventAdapter } from "./railway";
import { vercelEventAdapter } from "./vercel";
import { cloudflareEventAdapter } from "./cloudflare";

export const providerEventAdapters: Record<ProviderKey, ProviderEventAdapter> = {
  supabase: supabaseEventAdapter,
  railway: railwayEventAdapter,
  vercel: vercelEventAdapter,
  cloudflare: cloudflareEventAdapter,
};

export function getEventAdapter(provider: string): ProviderEventAdapter | null {
  return (providerEventAdapters as Record<string, ProviderEventAdapter>)[provider] ?? null;
}
