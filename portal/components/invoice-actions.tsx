"use client";

import { useRouter } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { deleteInvoice } from "@/lib/actions/invoices";

export function InvoiceActions({
  invoiceId,
  redirectTo,
}: {
  invoiceId: string;
  redirectTo?: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    const res = await deleteInvoice(invoiceId);
    if (res.error) {
      alert(res.error);
    } else if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/admin/invoices/${invoiceId}/edit`}
        className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
      >
        Edit
      </Link>
      <button
        onClick={handleDelete}
        className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
      >
        Delete
      </button>
    </div>
  );
}
