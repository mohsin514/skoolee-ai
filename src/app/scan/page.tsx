import { ScanHub } from "@/components/drop/scan-hub";

export const metadata = { title: "Scan sheets" };

/** SKAI-1851: framed staff route; RoleFrame supplies the page's one `<main>`. */
export default function Page() { return <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4"><ScanHub /></div>; }
