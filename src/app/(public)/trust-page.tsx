import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TrustPageCopy {
  title: string;
  description: string;
  sections: {
    title: string;
    body: string;
  }[];
}

export function TrustPage({ copy }: { copy: TrustPageCopy }) {
  return (
    <main className="min-h-screen bg-white text-[#1f1a23]">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/ai-school-management-software">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Product
          </Button>
        </Link>

        <div className="mt-10 border-b border-[#e8e0ed] pb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-normal">{copy.title}</h1>
          <p className="mt-4 text-lg leading-8 text-[#4d4354]/75">{copy.description}</p>
        </div>

        <div className="grid gap-5 py-8">
          {copy.sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-[#e8e0ed] p-5">
              <h2 className="text-lg font-bold tracking-normal">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[#4d4354]/75">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
