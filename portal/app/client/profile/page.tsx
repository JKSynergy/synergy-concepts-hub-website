import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";

export default async function ClientProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <ProfileForm profile={profile} />
      {profile.external_portal_url && (
        <div className="rounded-xl bg-white p-6 shadow">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            External Portal
          </h3>
          <a
            href={profile.external_portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sch-blue hover:underline"
          >
            Open your dedicated portal →
          </a>
        </div>
      )}
    </div>
  );
}
