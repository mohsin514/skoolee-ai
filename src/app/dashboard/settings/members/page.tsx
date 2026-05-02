"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function MembersPage() {
  return (
    <>
      <Header
        title="Member Management"
        description="Manage school staff, teachers, and administrators"
      />

      <div className="p-6">
        <Card className="max-w-3xl">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#fbf0fe] text-[#8127cf] shadow-inner">
              <Users className="h-8 w-8" />
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
    </>
  );
}
