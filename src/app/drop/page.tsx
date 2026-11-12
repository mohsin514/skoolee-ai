import type { Metadata } from "next";
import { DropPhone } from "@/components/drop/drop-phone";

export const metadata: Metadata = { title: "Send to your computer", robots: { index: false, follow: false }, referrer: "no-referrer" };

// SKAI-1848: public shell for the phone side of Skoolee Drop. The capability is in the URL fragment and every
// action goes through /api/drop/phone, which accepts only that link.
export default function DropPage() {
  return <DropPhone />;
}
