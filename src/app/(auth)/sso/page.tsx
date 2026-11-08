import { Suspense } from "react";
import { SsoChooser } from "@/components/identity/sso";

export const metadata = { title: "School sign-in" };

export default function Page() { return <Suspense><SsoChooser /></Suspense>; }
