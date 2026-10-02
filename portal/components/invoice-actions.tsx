"use client";

import { useRouter } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { deleteInvoice } from "@/lib/actions/invoices";
import { useFeedback } from "@/components/ux/feedback";

export function InvoiceActions({
  invoiceId,
  redirectTo,
  showOpen = false,
  canDelete = true,
}: {
  invoiceId: string;
  redirectTo?: string;
  showOpen?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { confirm: askConfirm, toast } = useFeedback();

  async function handleDelete() {
    const ok = await askConfirm({
      title: "Delete this invoice?",
      body: "Only draft invoices with no payments can be deleted. Anything else must be cancelled instead.",
      confirmLabel: "Delete invoice",
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteInvoice(invoiceId);
    if (res.error) {
      toast(res.error, "error");
    } else if (redirectTo) {
      toast("Invoice deleted");
      router.push(redirectTo);
    } else {
      toast("Invoice deleted");
      router.refresh();
    }
  }

  return (
    <div className="ux-rowactions">
      {showOpen && (
        <Link href={`/admin/invoices/${invoiceId}`} className="ux-textbtn ux-textbtn--strong">
          Open
        </Link>
      )}
      <Link href={`/admin/invoices/${invoiceId}/edit`} className="ux-textbtn">
        Edit
      </Link>
      {canDelete && (
        <button type="button" onClick={handleDelete} className="ux-textbtn ux-textbtn--danger">
          Delete
        </button>
      )}
    </div>
  );
}
