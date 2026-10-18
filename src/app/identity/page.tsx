import { IdentityAdmin } from "@/components/identity/identity-admin";

export const metadata = { title: "Identity and roster" };

export default function Page() { return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-4 p-4 sm:p-6"><IdentityAdmin /></main>; }
