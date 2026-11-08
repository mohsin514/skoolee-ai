import { Suspense } from "react";
import { SsoCallback } from "@/components/identity/sso";

export const metadata = { title: "School sign-in" };

export default function Page() { return <Suspense><SsoCallback /></Suspense>; }
