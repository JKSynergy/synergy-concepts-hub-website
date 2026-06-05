import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AcademyManager from "./academy-manager";
import type { AcademyCourse } from "@/lib/types";

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

  if (!profile || profile.role !== "admin") {
    redirect("/admin");
  }

  const { data: courses } = await supabase
    .from("academy_courses")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Academy Courses</h1>
      <AcademyManager courses={(courses ?? []) as AcademyCourse[]} />
    </div>
  );
}
