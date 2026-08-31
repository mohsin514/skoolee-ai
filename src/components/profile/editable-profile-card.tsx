"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, Camera, GraduationCap, Loader2, Mail, MapPin, Save, ShieldCheck, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard/BrandButton";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/ui/avatar-image";

export type EditableProfile = {
  id?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  role?: string;
  roleLabel?: string;
  dashboardPath?: string;
  profileImageUrl?: string;
  // Collected during onboarding (teachers) or by an admin on invite. Read-only
  // here: these drive subject matching and payroll, so they are not something a
  // user re-types into their own profile card.
  qualification?: string;
  specialization?: string;
  subjectSpecialties?: string[];
  teachesAllSubjects?: boolean;
  experience?: string;
  joiningDate?: string;
  city?: string;
};

type EditableProfileCardProps = {
  compact?: boolean;
  initialProfile?: EditableProfile;
  onSaved?: (profile: EditableProfile) => void;
  className?: string;
};

// Initials are rendered by AvatarImage; there is no synthetic photo URL.
function fallbackAvatar(_name?: string): string | undefined {
  return undefined;
}

export function EditableProfileCard({ compact, initialProfile, onSaved, className }: EditableProfileCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<EditableProfile>(initialProfile || {});
  const [form, setForm] = useState({
    fullName: initialProfile?.fullName || "",
    phone: initialProfile?.phone || "",
    profileImageUrl: initialProfile?.profileImageUrl || "",
  });
  const [loading, setLoading] = useState(!initialProfile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageSrc = previewUrl || form.profileImageUrl || fallbackAvatar(form.fullName || profile.fullName);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.profile) return;
        setProfile(data.profile);
        setForm({
          fullName: data.profile.fullName || "",
          phone: data.profile.phone || "",
          profileImageUrl: data.profile.profileImageUrl || "",
        });
        onSaved?.(data.profile);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onSaved]);

  const handleImageFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Use an image under 1.5 MB");
      return;
    }

    setUploading(true);
    const blobUrl = URL.createObjectURL(file);
    setPreviewUrl(blobUrl);
    try {
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "profile", fileName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData?.data?.key || !presignData?.data?.uploadUrl) {
        throw new Error(presignData?.error || "Could not prepare upload");
      }
      const { key, uploadUrl } = presignData.data;

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Upload failed");

      setForm((current) => ({ ...current, profileImageUrl: key }));
      toast.success("Image uploaded");
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      setPreviewUrl(null);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          profileImageUrl: form.profileImageUrl.trim() || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Profile could not be saved");
      setProfile(result.profile);
      setForm({
        fullName: result.profile.fullName || "",
        phone: result.profile.phone || "",
        profileImageUrl: result.profile.profileImageUrl || "",
      });
      onSaved?.(result.profile);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-lg transition-all duration-300 hover:shadow-xl", compact ? "p-5" : "p-7", className)}>
      <div className={cn("grid gap-6", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[260px_1fr]")}>
        <div className="rounded-[30px] bg-gradient-to-br from-[#fbf0fe] via-[#fbf0fe]/70 to-white p-5">
          <div className="group relative mx-auto h-32 w-32 overflow-hidden rounded-[34px] border-4 border-white bg-white shadow-xl">
            <AvatarImage src={imageSrc} name={form.fullName || profile.fullName} initialsClassName="text-3xl" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#8127cf]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="h-6 w-6 animate-spin text-[#8127cf]" />
              </div>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleImageFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-[#8127cf] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#8127cf] hover:text-white hover:shadow-lg active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {uploading ? "Uploading" : "Add Image"}
          </button>
          <div className="mt-4 space-y-2">
            <ProfileChip icon={UserRound} label={profile.roleLabel || "Active account"} />
            <ProfileChip icon={Mail} label={profile.email || "Email locked"} />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8127cf]">Account Profile</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#1d1b20]">{form.fullName || "Your profile"}</h3>
          </div>

          <ProfileInput
            label="Full name"
            value={form.fullName}
            placeholder="Your full name"
            onChange={(value) => setForm((current) => ({ ...current, fullName: value }))}
          />
          <ProfileInput
            label="Phone"
            value={form.phone}
            placeholder="+92..."
            onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
          />
          {form.profileImageUrl.startsWith("data:") || form.profileImageUrl.startsWith("profile-images/") ? null : (
            <ProfileInput
              label="Image URL"
              value={form.profileImageUrl}
              placeholder="https://example.com/photo.jpg"
              onChange={(value) => setForm((current) => ({ ...current, profileImageUrl: value }))}
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadonlyDetail icon={ShieldCheck} label="Role" value={profile.roleLabel || "Active"} />
            <ReadonlyDetail icon={Mail} label="Email" value={profile.email || "Locked"} />
            {profile.qualification ? (
              <ReadonlyDetail icon={GraduationCap} label="Qualification" value={profile.qualification} />
            ) : null}
            {profile.experience ? (
              <ReadonlyDetail icon={Sparkles} label="Experience" value={profile.experience} />
            ) : null}
            {profile.joiningDate ? (
              <ReadonlyDetail icon={CalendarDays} label="Joined" value={profile.joiningDate} />
            ) : null}
            {profile.city ? (
              <ReadonlyDetail icon={MapPin} label="City" value={profile.city} />
            ) : null}
          </div>

          {/* What the timetable builder matches on. Shown as chips so it reads
              as a list of subjects rather than a comma-jammed sentence. */}
          {(profile.teachesAllSubjects || (profile.subjectSpecialties?.length ?? 0) > 0) ? (
            <div className="rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/55 px-4 py-3.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                <BookOpen className="h-3.5 w-3.5 text-[#8127cf]" />
                Teaching specialities
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {profile.teachesAllSubjects ? (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700">
                    All subjects
                  </span>
                ) : (
                  profile.subjectSpecialties?.map((subject) => (
                    <span
                      key={subject}
                      className="rounded-full bg-[#8127cf]/10 px-3 py-1 text-[11px] font-bold text-[#8127cf]"
                    >
                      {subject}
                    </span>
                  ))
                )}
              </div>
              <p className="mt-2.5 text-[10px] font-semibold text-ink-subtle">
                Used when subjects and timetable slots are assigned to you.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <BrandButton
              variant="soft"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setForm((current) => ({ ...current, profileImageUrl: "" }));
              }}
              disabled={saving || uploading || !form.profileImageUrl}
            >
              Remove Image
            </BrandButton>
            <BrandButton variant="dark" icon={saving || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Saving" : uploading ? "Uploading" : "Save Profile"}
            </BrandButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block pl-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 py-3 text-sm font-bold outline-none transition-all duration-300 placeholder:text-ink-subtle hover:border-[#8127cf]/20 focus:border-[#8127cf]/35 focus:bg-white"
      />
    </label>
  );
}

function ProfileChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]">
      <Icon className="h-3.5 w-3.5 text-[#8127cf]" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function ReadonlyDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#fbf0fe]/55 px-4 py-3 transition-all duration-300 hover:bg-[#fbf0fe] hover:shadow-md">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        <Icon className="h-3.5 w-3.5 text-[#8127cf]" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-bold text-[#1d1b20]">{value}</p>
    </div>
  );
}
