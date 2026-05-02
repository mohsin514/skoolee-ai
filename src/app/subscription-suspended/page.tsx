import Link from "next/link";
import { CreditCard, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SubscriptionSuspendedPage() {
  return (
    <main className="min-h-screen bg-[#fbf0fe] px-6 py-12 text-[#1f1a23]">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
        <Card className="w-full border-amber-200 bg-white shadow-2xl shadow-amber-100/40">
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-amber-100 text-amber-700 shadow-inner">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-black">Subscription needs attention</h1>
                <p className="mt-2 text-sm font-medium leading-6 text-[#4d4354]/70">
                  Access to school operations is paused until billing is updated. Your records stay in place, and
                  administrators can still open billing to restore the subscription.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/dashboard/billing">
                    <Button>
                      <CreditCard className="h-4 w-4" />
                      Open billing
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
