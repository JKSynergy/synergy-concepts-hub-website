import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";
import { PageHeader, Section } from "@/components/ux/primitives";

export default async function ClientProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/login");

  return (
    <div className="ux-page ux-page--narrow">
      <PageHeader title="Profile" description="Your contact and billing details. We use these on invoices." />
      <ProfileForm profile={profile} />
      {profile.external_portal_url && (
        <Section title="External portal">
          <p className="ux-desc">
            <a href={profile.external_portal_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ux-blue)" }}>
              Open your dedicated portal →
            </a>
          </p>
        </Section>
      )}
    </div>
  );
}
