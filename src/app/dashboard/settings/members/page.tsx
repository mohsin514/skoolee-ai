"use client";

import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Network, Users } from "lucide-react";

export default function MembersPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Member Management"
        description="Manage school staff, teachers, and administrators"
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
        <Card className="sk-enter max-w-3xl">
          <EmptyState
            icon={Users}
            title="Member tools are moving to custom auth"
            description="Staff, teacher, and administrator access will live here once the custom auth engine migration is complete. Until then, the staff hierarchy shows who reports to whom."
            action={
              <Link href="/dashboard/staff-hierarchy" className={buttonVariants({ variant: "outline" })}>
                <Network aria-hidden="true" />
                Open Staff Hierarchy
              </Link>
            }
          />
        </Card>
      </div>
    </div>
  );
}
