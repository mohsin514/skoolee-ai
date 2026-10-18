import { TripDesk } from "@/components/transport/transport";

export const metadata = { title: "Today's trips" };

export default function Page() { return <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 px-4 py-4 sm:p-6"><TripDesk /></main>; }
