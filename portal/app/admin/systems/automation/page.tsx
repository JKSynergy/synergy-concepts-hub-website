import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import AutomationManager from "./automation-manager";

export const metadata = { title: "Automation" };

export default async function AutomationPage() {
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

  if (!profile || !isInternal(profile.role)) {
    redirect("/client");
  }

  const isAdmin = checkIsAdmin(profile.role);
  const canSeeRuns = isAdmin || isFinance(profile.role) || isStaff(profile.role);

  const { data: rules } = await supabase
    .from("automation_rule_overview")
    .select("*")
    .order("rule_key")
    .limit(50);

  const { data: runs } = canSeeRuns
    ? await supabase
        .from("automation_run_overview")
        .select("*")
        .order("evaluated_at", { ascending: false })
        .limit(200)
    : { data: [] };

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Automation"
        description="Deterministic operational rules evaluated inside the existing monitoring pipeline. Internal-safe actions create signals and tasks; provider-side actions become operation proposals that still require administrator approval — automation never mutates provider infrastructure."
      />
      <AutomationManager
        rules={rules ?? []}
        runs={runs ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
