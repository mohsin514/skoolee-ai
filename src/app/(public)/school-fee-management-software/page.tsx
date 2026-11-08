import type { Metadata } from "next";
import { CreditCard, Receipt, WalletCards } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["school fee management software", "school invoices", "fee challan software", "school payment tracking"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("school-fee-management-software", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <ProductPage id="school-fee-management-software" icons={[WalletCards, Receipt, CreditCard]} searchParams={searchParams} />;
}
