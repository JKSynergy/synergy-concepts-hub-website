import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ux/primitives";
import { isInternal, isAdmin as checkIsAdmin, isFinance, isStaff } from "@/lib/security/roles";
import ActionCenterManager from "./action-center-manager";

export const metadata = { title: "Action Center" };

export default async function ActionCenterPage() {
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

  // Keep the query error — a failed feed is not a clear queue.
  const { data: items, error: itemsError } = await supabase
    .from("action_item_overview")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(200);

  return (
    <div className="ux-page ux-page--wide ops-page">
      <PageHeader
        title="Action Center"
        description="Signals that need attention. Acknowledge, resolve or dismiss them — resolving a condition clears its signal."
      />
      <ActionCenterManager
        items={items ?? []}
        itemsUnavailable={Boolean(itemsError)}
        canReview={checkIsAdmin(profile.role) || isStaff(profile.role)}
        isFinance={isFinance(profile.role)}
        canSeeProviderData={checkIsAdmin(profile.role) || isFinance(profile.role)}
      />
    </div>
  );
}
