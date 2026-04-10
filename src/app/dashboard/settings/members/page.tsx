"use client";

import { OrganizationProfile } from "@clerk/nextjs";
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
        <OrganizationProfile 
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border-none w-full max-w-none p-0",
              navbar: "hidden", // Hide sidebar to integrate into our layout
              header: "hidden",
              pageScrollBox: "p-6",
              organizationProfile: "w-full",
            }
          }}
        />
      </div>
    </div>
  );
}
