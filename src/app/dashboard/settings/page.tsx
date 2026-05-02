"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { Header } from "@/components/layout/header";
import { EditableProfileCard } from "@/components/profile/editable-profile-card";

export default function SettingsPage() {
  return (
    <>
      <Header title="Account Settings" description="Update your profile photo, display name, and contact details." />

      <div className="p-6">
        <div className="grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
          <EditableProfileCard />

          <aside className="space-y-4">
            <div className="rounded-[32px] border border-[#cfc2d6]/15 bg-white p-6 shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fbf0fe] text-[#8127cf]">
                <UserRound className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-black text-[#1f1a23]">Profile Scope</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-[#4d4354]/65">
                Every role keeps the same account profile card, while sensitive permissions, role, and email remain protected.
              </p>
            </div>

            <div className="rounded-[32px] border border-[#cfc2d6]/15 bg-[#fbf0fe]/70 p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#8127cf]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-black text-[#1f1a23]">Allowed Changes</h2>
              <div className="mt-4 space-y-2 text-sm font-bold text-[#4d4354]/70">
                <p className="rounded-2xl bg-white px-4 py-3">Profile image</p>
                <p className="rounded-2xl bg-white px-4 py-3">Full name</p>
                <p className="rounded-2xl bg-white px-4 py-3">Phone number</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
