"use client";

// import { OrganizationProfile } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function MembersPage() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-sidebar-foreground">
            Member Management
          </h2>
          <p className="text-muted-foreground">
            Manage your school staff, teachers, and administrators.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-sidebar-border bg-card overflow-hidden">
        <div className="p-12 text-center text-gray-500 font-medium bg-white italic">
          <Users className="mx-auto h-12 w-12 text-gray-200 mb-4" />
          <p>Member management settings are being migrated to the custom auth engine.</p>
        </div>
      </div>
    </div>
  );
}
