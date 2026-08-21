"use client";

import { ShieldCheck } from "lucide-react";
import { Header } from "@/components/layout/header";
import { EditableProfileCard } from "@/components/profile/editable-profile-card";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Account Settings" description="Update your profile photo, display name, and contact details." />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
          <EditableProfileCard />

          <aside className="space-y-4">
            <div className="sk-rise group relative rounded-[32px] border border-[#cfc2d6]/25 bg-gradient-to-br from-[#fbf0fe]/80 to-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "160ms" }}>
              <div className="relative mb-4">
                <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#8127cf] shadow-md">
                  <ShieldCheck className="h-6 w-6" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-[#1d1b20] tracking-tight">Protected Fields</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-muted">
                Role, email, and account permissions are managed by your campus administrator and cannot be changed here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-muted border border-[#cfc2d6]/10">Role</span>
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-muted border border-[#cfc2d6]/10">Email</span>
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-muted border border-[#cfc2d6]/10">Permissions</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
