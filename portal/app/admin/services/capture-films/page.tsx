import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { PageHeader, Section } from "@/components/ux/primitives";
import { canManageQuoteCatalog, isOperationalStaff } from "@/lib/security/roles";
import { parseCatalog } from "@/lib/quote/catalog";
import CatalogEditor from "./catalog-editor";

export const metadata = { title: "Capture Films price list" };

export default async function CaptureFilmsPriceListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isOperationalStaff(profile.role)) redirect("/client");

  const { data: versions } = await supabase
    .from("quote_catalogs")
    .select("id, version, catalog, ugx_per_usd, note, published_at, published_by")
    .eq("business", "capture_films")
    .order("version", { ascending: false })
    .limit(20);
  const active = versions?.[0];
  const parsed = active ? parseCatalog(active.catalog) : null;

  return (
    <div className="ux-page ux-page--wide">
      <Link href="/admin/services" className="ux-back">
        ← Services
      </Link>
      <PageHeader
        eyebrow="Synergy Capture Films"
        title="Quotation price list"
        description="Prices used by the quotation builder on the website. UGX is the master price list; USD is an indicative conversion at the rate set here. Publishing creates a new version; submitted quotations keep the prices they were given."
      />
      {!active || !parsed || !parsed.ok ? (
        <p className="ux-notice ux-notice--error">The price list is missing or invalid. Check migration 040.</p>
      ) : (
        <CatalogEditor
          catalog={parsed.catalog}
          version={active.version}
          ugxPerUsd={active.ugx_per_usd === null ? null : Number(active.ugx_per_usd)}
          canEdit={canManageQuoteCatalog(profile.role)}
        />
      )}
      <Section title="Version history">
        <div className="ux-tablewrap">
          <table className="ux-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Published</th>
                <th>Exchange rate</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {(versions ?? []).map((v) => (
                <tr key={v.id}>
                  <td>{v.version}{v.id === active?.id ? " (active)" : ""}</td>
                  <td>{new Date(v.published_at).toLocaleString("en-GB", { timeZone: "Africa/Kampala" })}</td>
                  <td>{v.ugx_per_usd === null ? <span className="ux-muted">Not set (USD unavailable)</span> : `${Number(v.ugx_per_usd).toLocaleString("en-US")} UGX per USD`}</td>
                  <td>{v.note ?? <span className="ux-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
