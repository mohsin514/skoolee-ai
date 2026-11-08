import type { Metadata } from "next";
import { Building2, Shield, Users } from "lucide-react";
import { ProductPage, productMetadata } from "../product-page";
import type { LangSearchParams } from "../public-lang";

const SEO: Metadata = {
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["multi-campus school ERP", "school group software", "campus management software", "school ERP Pakistan"],
};

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => productMetadata("multi-campus-school-erp", searchParams, SEO);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <ProductPage id="multi-campus-school-erp" icons={[Building2, Shield, Users]} searchParams={searchParams} />;
}
