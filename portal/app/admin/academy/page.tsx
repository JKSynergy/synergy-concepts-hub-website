import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AcademyManager from "./academy-manager";
import type { AcademyCourse } from "@/lib/types";
import { isAdmin as isAdminRole } from "@/lib/security/roles";

export default async function AdminAcademyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdminRole(profile.role)) {
    redirect("/admin");
  }

  const { data: courses } = await supabase
    .from("academy_courses")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="ux-page">
      <AcademyManager courses={(courses ?? []) as AcademyCourse[]} />
    </div>
  );
}
