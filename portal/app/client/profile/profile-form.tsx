"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/actions/profile";
import { useFeedback } from "@/components/ux/feedback";

interface Profile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  billing_address: string | null;
  tax_id: string | null;
  email: string;
}

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function action(formData: FormData) {
    setError("");
    setSaving(true);
    const res = await updateProfile(formData);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
      return;
    }
    toast("Profile saved.");
    router.refresh();
  }

  return (
    <form action={action}>
      {error && <div className="ux-notice ux-notice--error">{error}</div>}

      <section className="ux-section">
        <div className="ux-section-head">
          <h2>Contact</h2>
        </div>
        <div className="ux-formgrid">
          <label className="ux-field ux-full">
            <span>Email</span>
            <input readOnly defaultValue={profile.email} className="ux-input" />
          </label>
          <label className="ux-field">
            <span>Full name</span>
            <input name="full_name" defaultValue={profile.full_name ?? ""} className="ux-input" />
          </label>
          <label className="ux-field">
            <span>Phone</span>
            <input name="phone" type="tel" defaultValue={profile.phone ?? ""} className="ux-input" />
          </label>
        </div>
      </section>

      <section className="ux-section">
        <div className="ux-section-head">
          <h2>Billing</h2>
        </div>
        <div className="ux-formgrid">
          <label className="ux-field">
            <span>Company name</span>
            <input name="company_name" defaultValue={profile.company_name ?? ""} className="ux-input" />
          </label>
          <label className="ux-field">
            <span>Tax ID</span>
            <input name="tax_id" defaultValue={profile.tax_id ?? ""} className="ux-input" />
          </label>
          <label className="ux-field ux-full">
            <span>Billing address</span>
            <textarea name="billing_address" rows={3} defaultValue={profile.billing_address ?? ""} className="ux-input" />
          </label>
        </div>
      </section>

      <div className="ux-actions">
        <button type="submit" disabled={saving} className="ux-btn ux-btn--primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
