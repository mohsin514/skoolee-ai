import { ServiceDesk } from "@/components/service-desk/service-desk";

export const metadata = { title: "Service desk" };

/**
 * The framed /service-desk route (SPEC §6.3). RoleFrame already supplies the page's one `<main id="workspace-content">`,
 * so this renders the desk itself (which opens with its PageHeader) in a plain container, never a second `<main>`.
 */
export default function Page() { return <div className="mx-auto w-full min-w-0 max-w-4xl space-y-4"><ServiceDesk /></div>; }
