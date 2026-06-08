"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  function reset() {
    setEmail("");
    setFullName("");
    setCompanyName("");
    setPhone("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        company_name: companyName,
        phone,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to add client");
      return;
    }

    setCreated({ email: data.email, tempPassword: data.tempPassword });
    reset();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-sch-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        + Add Client
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Add a Client</h3>
        <button
          onClick={() => {
            setOpen(false);
            setCreated(null);
            reset();
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>

      {created ? (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
            <p className="font-semibold">Client account created.</p>
            <p className="mt-2">
              Share these temporary credentials securely. The client should
              change the password after first login.
            </p>
            <div className="mt-3 space-y-1 rounded-md bg-white p-3 font-mono text-gray-800">
              <div>
                <span className="text-gray-500">Email:</span> {created.email}
              </div>
              <div>
                <span className="text-gray-500">Temp password:</span>{" "}
                {created.tempPassword}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `Email: ${created.email}\nTemporary password: ${created.tempPassword}`
                )
              }
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Copy credentials
            </button>
            <button
              onClick={() => setCreated(null)}
              className="rounded-md bg-sch-blue px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Add another
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-blue focus:outline-none focus:ring-1 focus:ring-sch-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-blue focus:outline-none focus:ring-1 focus:ring-sch-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Company
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-blue focus:outline-none focus:ring-1 focus:ring-sch-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sch-blue focus:outline-none focus:ring-1 focus:ring-sch-blue"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-sch-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Client"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
