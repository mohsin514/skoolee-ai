"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function MembersPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Member Management"
        description="Manage school staff, teachers, and administrators"
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <Card className="sk-rise group relative max-w-3xl border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]" style={{ animationDelay: "0ms" }}>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-5">
              <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#fbf0fe] text-[#8127cf] shadow-inner">
                <Users className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-xl font-black text-[#1f1a23]">
              Member tools are moving to custom auth
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-[#4d4354]/65">
              Staff, teacher, and administrator access will live here once the custom auth engine migration is complete.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
