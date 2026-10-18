import { TaxPackages } from "@/components/tax/tax-packages";

export const metadata = { title: "Invoice tax packages" };

export default function Page() { return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4 sm:p-6"><TaxPackages /></main>; }
