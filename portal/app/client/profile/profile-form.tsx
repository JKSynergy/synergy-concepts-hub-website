"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/actions/profile";

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
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function action(formData: FormData) {
    setMsg(null);
    const res = await updateProfile(formData);
    if (res.error) {
      setMsg({ type: "err", text: res.error });
      return;
    }
    setMsg({ type: "ok", text: "Profile updated." });
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      {msg && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            msg.type === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            readOnly
            defaultValue={profile.email}
            className="mt-1 block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Full Name
          </label>
          <input
            name="full_name"
            defaultValue={profile.full_name ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Company Name
          </label>
          <input
            name="company_name"
            defaultValue={profile.company_name ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            defaultValue={profile.phone ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Billing Address
          </label>
          <textarea
            name="billing_address"
            rows={2}
            defaultValue={profile.billing_address ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Tax ID
          </label>
          <input
            name="tax_id"
            defaultValue={profile.tax_id ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-orange focus:outline-none focus:ring-1 focus:ring-sch-orange"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-sch-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
