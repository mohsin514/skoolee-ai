import type { Metadata } from "next";
import { CreditCard, Receipt, WalletCards } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "School Fee Management Software",
  description: "Create fee structures, generate invoices, track due balances, record payments, and view fee collection status in SkooleeAI.",
  keywords: ["school fee management software", "school invoices", "fee challan software", "school payment tracking"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "School fee management software",
        title: "Manage fee structures, invoices, and payment status beside academics.",
        description:
          "SkooleeAI keeps class fee structures, term invoices, balances, due dates, payment records, and collection summaries in the same system as student performance.",
        highlights: ["Class-based fee structures", "Bulk invoice generation", "Payment recording", "Due and partial status tracking"],
        sections: [
          { icon: WalletCards, title: "Fee setup", body: "Define tuition, exam fees, annual fees, month counts, academic years, and terms per class." },
          { icon: Receipt, title: "Invoice workflow", body: "Generate invoices for class students, skip existing invoices, and keep paid, pending, partial, due, and cancelled states clear." },
          { icon: CreditCard, title: "Collection visibility", body: "Record payments with methods and receipt numbers, calculate balances, and summarize collection performance." },
        ],
        proof: ["Fee workflows respect school and campus scope.", "Suspended subscriptions pause operational actions.", "Billing and SaaS subscription management live in one place."],
      }}
    />
  );
}
