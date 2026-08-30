"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Heart,
  Keyboard,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  FormSection,
  ReviewHero,
  ReviewRow,
  ReviewSection,
  WizardShell,
} from "@/components/shared-admin/wizard-shell";

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
}

interface ClassGroup {
  key: string;
  name: string;
  academicYear: number | string;
  sections: ClassRecord[];
}

interface AdmissionFormProps {
  classes: ClassRecord[];
  classGroups: ClassGroup[];
  onSuccess?: (student?: any) => void;
  onClose: () => void;
  initialClassId?: string;
  initialSection?: string;
  initialPrefill?: Partial<Record<keyof FormData, string>>;
}

const STEPS = [
  { label: "Personal Info", icon: User, blurb: "Who the student is and which class they join." },
  { label: "Guardian Details", icon: Users, blurb: "Who the school contacts about this student." },
  { label: "Address & Medical", icon: MapPin, blurb: "Where they live and anything staff must know." },
  { label: "Review & Submit", icon: Check, blurb: "Check everything before the record is created." },
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

const RELATIONSHIPS = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "uncle", label: "Uncle" },
  { value: "aunt", label: "Aunt" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  fullName: "",
  nameUr: "",
  dateOfBirth: "",
  gender: "MALE",
  bloodType: "",
  nationality: "Pakistan",
  phone: "",
  studentEmail: "",
  classId: "",
  rollNo: "",
  previousSchool: "",
  guardianName: "",
  guardianNameUr: "",
  guardianRelationship: "",
  guardianPhone: "",
  guardianWhatsapp: "",
  guardianEmail: "",
  guardianOccupation: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  medicalNotes: "",
  specialNeeds: "",
  allergies: "",
  medications: "",
  categoryId: "",
  groupId: "",
  siblingStudentId: "",
};

type FormData = typeof emptyForm;
type FormErrors = Partial<Record<keyof FormData, string>>;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

const TRANSLITERATION_RULES: [string, string][] = [
  ["sh", "ش"], ["ch", "چ"], ["kh", "خ"], ["th", "ث"], ["ph", "ف"],
  ["gh", "غ"], ["zh", "ژ"], ["aa", "ا"], ["ee", "ی"], ["oo", "و"],
  ["ai", "ائ"], ["au", "او"], ["ei", "ائ"],
  ["a", "ا"], ["b", "ب"], ["c", "ک"], ["d", "د"], ["e", "ے"],
  ["f", "ف"], ["g", "گ"], ["h", "ہ"], ["i", "ی"], ["j", "ج"],
  ["k", "ک"], ["l", "ل"], ["m", "م"], ["n", "ن"], ["o", "و"],
  ["p", "پ"], ["q", "ق"], ["r", "ر"], ["s", "س"], ["t", "ت"],
  ["u", "و"], ["v", "و"], ["w", "و"], ["x", "کس"], ["y", "ی"],
  ["z", "ز"],
];

function transliterateToUrdu(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      let result = "";
      let i = 0;
      const lower = word.toLowerCase();
      while (i < lower.length) {
        let matched = false;
        for (const [from, to] of TRANSLITERATION_RULES) {
          if (lower.startsWith(from, i)) {
            result += to;
            i += from.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          result += lower[i];
          i++;
        }
      }
      return result;
    })
    .join(" ");
}

const URDU_KEYS = [
  ["ا", "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ"],
  ["د", "ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "س", "ش", "ص"],
  ["ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل"],
  ["م", "ن", "ں", "و", "ہ", "ھ", "ء", "ی", "ے", " "],
];

function UrduInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowKeyboard(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="rtl"
          lang="ur"
          className="flex-1"
        />
        <button
          type="button"
          className={`shrink-0 rounded-xl px-2.5 transition-all ${
            showKeyboard
              ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
              : "bg-[#f3f4f9] text-ink-muted hover:bg-[#fbf0fe] hover:text-[#8127cf]"
          }`}
          onClick={() => setShowKeyboard(!showKeyboard)}
          title="Urdu keyboard"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {showKeyboard && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-[#cfc2d6]/25 bg-white p-2.5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-ink-muted">اردو کی بورڈ</span>
            <button
              type="button"
              className="rounded-lg p-0.5 text-ink-subtle hover:text-[#8127cf]"
              onClick={() => setShowKeyboard(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {URDU_KEYS.map((row, ri) => (
            <div key={ri} className="flex gap-0.5 mb-0.5">
              {row.map((char, ci) => (
                <button
                  key={ci}
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-all ${
                    char === " "
                      ? "bg-[#f3f4f9] text-[10px] text-ink-subtle hover:bg-[#fbf0fe]"
                      : "bg-[#f3f4f9] text-[#1f1a23] hover:bg-[#8127cf] hover:text-white active:scale-95"
                  }`}
                  onClick={() => {
                    onChange(value + char);
                  }}
                >
                  {char === " " ? "Space" : char}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-0.5 flex gap-0.5">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-ink-muted hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange(value.slice(0, -1))}
            >
              ← Backspace
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-ink-muted hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange("")}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function classGroupKey(cls: ClassRecord) {
  return `${cls.academicYear}::${cls.name}`;
}

function sectionLabel(cls: ClassRecord) {
  return cls.section || "Main";
}

export function AdmissionForm({ classes, classGroups, onSuccess, onClose, initialClassId, initialPrefill }: AdmissionFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => ({
    ...emptyForm,
    ...(initialPrefill || {}),
    classId: (initialClassId && classes.some((cls) => cls.id === initialClassId) ? initialClassId : classes[0]?.id) || "",
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<{ categories: any[]; groups: any[] }>({ categories: [], groups: [] });
  const [siblings, setSiblings] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/student-categories").then((r) => r.json()),
      fetch("/api/student-groups").then((r) => r.json()),
    ])
      .then(([cats, grps]) => {
        if (!active) return;
        setTags({
          categories: cats.success ? cats.data : [],
          groups: grps.success ? grps.data : [],
        });
      })
      .catch(() => {});

    fetch("/api/students/siblings")
      .then((r) => r.json())
      .then((j) => {
        if (active && j.success) setSiblings(j.data || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const nameUrManuallyEdited = useRef(false);
  const guardianNameUrManuallyEdited = useRef(false);
  const rollNoManuallyEdited = useRef(false);
  const rollNoFetchController = useRef<AbortController | null>(null);
  const [rollNoLoading, setRollNoLoading] = useState(false);

  const fetchNextRollNo = useCallback(async (classId: string) => {
    if (!classId) return;
    rollNoFetchController.current?.abort();
    const controller = new AbortController();
    rollNoFetchController.current = controller;
    setRollNoLoading(true);
    try {
      const res = await fetch(`/api/students/next-roll?classId=${classId}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!controller.signal.aborted && !rollNoManuallyEdited.current) {
        setForm((prev) => ({ ...prev, rollNo: data.rollNo }));
      }
    } catch {
    } finally {
      if (!controller.signal.aborted) setRollNoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (form.classId) fetchNextRollNo(form.classId);
  }, [form.classId, fetchNextRollNo]);

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "fullName" && !nameUrManuallyEdited.current) {
        next.nameUr = transliterateToUrdu(value);
      }
      if (field === "guardianName" && !guardianNameUrManuallyEdited.current) {
        next.guardianNameUr = transliterateToUrdu(value);
      }

      return next;
    });

    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

    if (field === "nameUr") nameUrManuallyEdited.current = true;
    if (field === "guardianNameUr") guardianNameUrManuallyEdited.current = true;
    if (field === "rollNo") rollNoManuallyEdited.current = true;
  };

  const regenerateRollNo = () => {
    rollNoManuallyEdited.current = false;
    if (form.classId) fetchNextRollNo(form.classId);
  };

  const selectedClass = classes.find((cls) => cls.id === form.classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : "";
  const selectedGroup = classGroups.find((g) => g.key === selectedGroupKey);
  const age = useMemo(() => calculateAge(form.dateOfBirth), [form.dateOfBirth]);

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((g) => g.key === key);
    const newClassId = group?.sections[0]?.id || "";
    rollNoManuallyEdited.current = false;
    update("classId", newClassId);
  };

  const validateStep = (stepIndex: number): boolean => {
    const newErrors: FormErrors = {};

    if (stepIndex === 0) {
      if (!form.fullName.trim()) newErrors.fullName = "Student name is required";
      if (!form.rollNo.trim()) newErrors.rollNo = "Roll number is required";
      if (!form.classId) newErrors.classId = "Class is required";
      if (form.dateOfBirth) {
        const studentAge = calculateAge(form.dateOfBirth);
        if (studentAge !== null && studentAge < 3) {
          newErrors.dateOfBirth = "Student must be at least 3 years old";
        }
      }
      if (form.studentEmail && !isValidEmail(form.studentEmail)) {
        newErrors.studentEmail = "Enter a valid email address";
      }
    }

    if (stepIndex === 1) {
      if (form.guardianEmail && !isValidEmail(form.guardianEmail)) {
        newErrors.guardianEmail = "Enter a valid email address";
      }
      if (
        form.studentEmail &&
        form.guardianEmail &&
        form.studentEmail.toLowerCase() === form.guardianEmail.toLowerCase()
      ) {
        newErrors.guardianEmail = "Must be different from student email";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep(0) || !validateStep(1)) {
      toast.error("Please fix errors in the form before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        gender: form.gender || "OTHER",
        bloodType: form.bloodType || null,
        guardianRelationship: form.guardianRelationship || null,
        studentEmail: form.studentEmail || null,
        guardianEmail: form.guardianEmail || null,
      };

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not add student");

      toast.success(data.message || "Student added successfully");

      if (data.guardianInviteFailures?.length) {
        toast.warning("Student created, but guardian invite email could not be sent.");
      }
      if (data.studentInviteFailures?.length) {
        toast.warning("Student created, but student login invite email could not be sent.");
      }

      onSuccess?.(data.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add student");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <WizardShell
      eyebrow="New Admission"
      icon={GraduationCap}
      steps={STEPS}
      step={step}
      onStepChange={setStep}
      onClose={onClose}
      onBack={goBack}
      onNext={goNext}
      onSubmit={handleSubmit}
      submitLabel="Submit Admission"
      submitting={isSubmitting}
      submittingLabel="Creating…"
    >
          {step === 0 && (
            <StepPersonalInfo
              form={form}
              errors={errors}
              age={age}
              classGroups={classGroups}
              selectedGroupKey={selectedGroupKey}
              selectedGroup={selectedGroup}
              tags={tags}
              siblings={siblings}
              rollNoLoading={rollNoLoading}
              onUpdate={update}
              onSelectClassGroup={selectClassGroup}
              onRegenerateRollNo={regenerateRollNo}
            />
          )}
          {step === 1 && (
            <StepGuardianDetails form={form} errors={errors} onUpdate={update} />
          )}
          {step === 2 && (
            <StepAddressMedical form={form} errors={errors} onUpdate={update} />
          )}
          {step === 3 && (
            <StepReview form={form} selectedClass={selectedClass} age={age} tags={tags} siblings={siblings} onEditStep={setStep} />
          )}
    </WizardShell>
  );
}

// ─── Step 1: Personal Info ────────────────────────────────

function StepPersonalInfo({
  form,
  errors,
  age,
  classGroups,
  selectedGroupKey,
  selectedGroup,
  tags,
  siblings,
  rollNoLoading,
  onUpdate,
  onSelectClassGroup,
  onRegenerateRollNo,
}: {
  form: FormData;
  errors: FormErrors;
  age: number | null;
  classGroups: ClassGroup[];
  selectedGroupKey: string;
  selectedGroup: ClassGroup | undefined;
  tags: { categories: any[]; groups: any[] };
  siblings: any[];
  rollNoLoading: boolean;
  onUpdate: (field: keyof FormData, value: string) => void;
  onSelectClassGroup: (key: string) => void;
  onRegenerateRollNo: () => void;
}) {
  return (
    <div className="space-y-5">
      <FormSection icon={User} title="Identity" hint="The student's name as it should appear on records and report cards.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Full Name (English) *" error={errors.fullName}>
          <Input
            value={form.fullName}
            onChange={(e) => onUpdate("fullName", e.target.value)}
            placeholder="Ali Ahmed Khan"
          />
        </FieldGroup>
        <FieldGroup label="Full Name (Urdu)" hint="Auto-generated from English name">
          <UrduInput
            value={form.nameUr}
            onChange={(val) => onUpdate("nameUr", val)}
            placeholder="علی احمد خان"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FieldGroup label="Gender">
          <div className="flex gap-2">
            {(["MALE", "FEMALE", "OTHER"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                  form.gender === g
                    ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
                    : "bg-[#f3f4f9] text-ink hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                }`}
                onClick={() => onUpdate("gender", g)}
              >
                {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
              </button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup
          label="Date of Birth"
          error={errors.dateOfBirth}
          hint={age !== null ? `Age: ${age} years old` : undefined}
        >
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => onUpdate("dateOfBirth", e.target.value)}
          />
        </FieldGroup>
        <FieldGroup label="Blood Type">
          <Select
            value={form.bloodType}
            onChange={(e) => onUpdate("bloodType", e.target.value)}
          >
            <option value="">Not Known</option>
            {BLOOD_TYPES.map((bt) => (
              <option key={bt} value={bt}>
                {bt}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>
      </FormSection>

      <FormSection icon={GraduationCap} title="Placement" hint="Which class the student joins, and the roll number they are given.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Class *" error={errors.classId}>
          <Select
            value={selectedGroupKey}
            onChange={(e) => onSelectClassGroup(e.target.value)}
          >
            <option value="">Select class</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name} - {group.academicYear}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Section *">
          <Select
            value={form.classId}
            onChange={(e) => onUpdate("classId", e.target.value)}
          >
            <option value="">Select section</option>
            {(selectedGroup?.sections || []).map((cls) => (
              <option key={cls.id} value={cls.id}>
                Section {sectionLabel(cls)}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Roll Number *" error={errors.rollNo} hint="Auto-generated, unique across campus">
          <div className="relative">
            <Input
              value={form.rollNo}
              onChange={(e) => onUpdate("rollNo", e.target.value)}
              placeholder="NUR-Y-001"
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-subtle transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              onClick={onRegenerateRollNo}
              title="Regenerate roll number"
            >
              {rollNoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </FieldGroup>
        <FieldGroup label="Previous School">
          <Input
            value={form.previousSchool}
            onChange={(e) => onUpdate("previousSchool", e.target.value)}
            placeholder="Name of previous school (if any)"
          />
        </FieldGroup>
      </div>
      </FormSection>

      <FormSection icon={Users} title="Contact & Access" hint="Optional. An email here creates the student's own portal login.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FieldGroup label="Student Phone">
          <Input
            value={form.phone}
            onChange={(e) => onUpdate("phone", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
        <FieldGroup label="Student Login Email" error={errors.studentEmail} hint="Sends a portal invite">
          <Input
            type="email"
            value={form.studentEmail}
            onChange={(e) => onUpdate("studentEmail", e.target.value)}
            placeholder="student@example.com"
          />
        </FieldGroup>
        <FieldGroup label="Nationality">
          <Input
            value={form.nationality}
            onChange={(e) => onUpdate("nationality", e.target.value)}
            placeholder="Pakistan"
          />
        </FieldGroup>
      </div>
      </FormSection>

      <FormSection icon={Check} title="Tags & Family" hint="Optional labels that drive fee discounts, transport lists and sibling links.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Category" hint="Fee / scholarship eligibility tag">
          <Select
            value={form.categoryId}
            onChange={(e) => onUpdate("categoryId", e.target.value)}
          >
            <option value="">No category</option>
            {tags.categories
              .filter((c) => c.isActive !== false || c.id === form.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Group" hint="Transport, hostel, house…">
          <Select
            value={form.groupId}
            onChange={(e) => onUpdate("groupId", e.target.value)}
          >
            <option value="">No group</option>
            {tags.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>

      <FieldGroup
        label="Link as sibling of"
        hint="Choose an existing student — they'll share a sibling group automatically. Leave blank for a new family."
      >
        <Select
          value={form.siblingStudentId}
          onChange={(e) => onUpdate("siblingStudentId", e.target.value)}
        >
          <option value="">No sibling link</option>
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} · {s.rollNo || "No roll"} · {[s.class?.name, s.class?.section].filter(Boolean).join(" ") || "Class?"}
            </option>
          ))}
        </Select>
      </FieldGroup>
      </FormSection>
    </div>
  );
}

// ─── Existing-guardian picker ─────────────────────────────

interface ExistingParent {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  parentedStudents: {
    id: string;
    fullName: string;
    rollNo: string;
    siblingGroupId: string | null;
    class: { name: string; section: string | null } | null;
  }[];
}

/**
 * Admitting a second child meant retyping the guardian from memory, and the
 * parent portal groups siblings by guardian email — so one typo split a family
 * into two accounts, each seeing one child. /api/students/parents was written
 * for this and never wired to anything; this is its screen.
 *
 * Picking a guardian fills their contact details verbatim and links the new
 * student to one of their existing children, so the sibling group forms itself.
 */
function GuardianPicker({
  onPick,
}: {
  onPick: (parent: ExistingParent) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ExistingParent[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    // Typing a full name is eight keystrokes; without a debounce that is eight
    // roster queries, and the last one to land wins rather than the last typed.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/students/parents?search=${encodeURIComponent(term)}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (json.success) {
          setResults(json.data);
          setOpen(true);
        }
      } catch {
        // Aborted by the next keystroke, or the lookup failed. Either way the
        // guardian fields below still work by hand, so stay quiet.
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  return (
    <div className="rounded-2xl border border-[#8127cf]/20 bg-[#fbf0fe]/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <UserCheck className="h-4 w-4 shrink-0 text-[#8127cf]" />
        <p className="text-xs font-black text-[#1f1a23]">
          Already have a guardian at this school?
        </p>
      </div>
      <p className="mb-3 text-[11px] font-semibold leading-relaxed text-ink-muted">
        Search by name, phone or email to reuse their details and link this student
        to their brothers and sisters.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ahmed Khan, +92 300…, guardian@example.com"
          className="pl-9"
          aria-label="Search existing guardians"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#8127cf]" />
        ) : null}
      </div>

      {open && search.trim().length >= 2 ? (
        <div className="mt-3 space-y-2">
          {results.length === 0 && !loading ? (
            <p className="px-1 text-[11px] font-bold text-ink-muted">
              No existing guardian matches that. Fill the fields below to add a new one.
            </p>
          ) : null}
          {results.map((parent) => (
            <button
              key={parent.id}
              type="button"
              onClick={() => {
                onPick(parent);
                setSearch("");
                setResults([]);
                setOpen(false);
              }}
              className="w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/30 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#8127cf]/40 hover:shadow-md"
            >
              <p className="truncate text-xs font-black text-[#1f1a23]">{parent.fullName}</p>
              <p className="truncate text-[11px] font-semibold text-ink-muted">
                {[parent.phone, parent.email].filter(Boolean).join(" · ") || "No contact details"}
              </p>
              {parent.parentedStudents.length > 0 ? (
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-[#8127cf]">
                  {parent.parentedStudents
                    .map((c) => `${c.fullName}${c.class ? ` (${c.class.name}${c.class.section ? ` ${c.class.section}` : ""})` : ""}`)
                    .join(" · ")}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Step 2: Guardian Details ─────────────────────────────

function StepGuardianDetails({
  form,
  errors,
  onUpdate,
}: {
  form: FormData;
  errors: FormErrors;
  onUpdate: (field: keyof FormData, value: string) => void;
}) {
  const noContact = !form.guardianPhone.trim() && !form.guardianEmail.trim();

  /**
   * Copy the chosen guardian across, and link the student to one of their
   * existing children so the sibling group forms without a second step. Only
   * fields the guardian actually has are written — an empty phone on their
   * record must not wipe one the registrar has already typed here.
   */
  const applyExistingGuardian = (parent: ExistingParent) => {
    onUpdate("guardianName", parent.fullName);
    if (parent.phone) onUpdate("guardianPhone", parent.phone);
    if (parent.email) onUpdate("guardianEmail", parent.email);
    const firstChild = parent.parentedStudents[0];
    if (firstChild) onUpdate("siblingStudentId", firstChild.id);
    toast.success(
      firstChild
        ? `Guardian copied and linked as a sibling of ${firstChild.fullName}`
        : "Guardian details copied"
    );
  };

  return (
    <div className="space-y-5">
      <GuardianPicker onPick={applyExistingGuardian} />

      {/*
        Neither field is required by the API, but a student with no reachable
        guardian is a support ticket waiting to happen — so say so here rather
        than letting the directory flag it weeks later.
      */}
      {noContact ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs font-semibold text-amber-800">
            No guardian phone or email yet. You can finish the admission without one, but the school will have
            no way to contact this student&apos;s family and no parent portal invite can be sent.
          </p>
        </div>
      ) : null}

      <FormSection icon={Users} title="Guardian" hint="The primary contact for this student.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Guardian Full Name (English)">
          <Input
            value={form.guardianName}
            onChange={(e) => onUpdate("guardianName", e.target.value)}
            placeholder="Ahmed Khan"
          />
        </FieldGroup>
        <FieldGroup label="Guardian Full Name (Urdu)" hint="Auto-generated from English name">
          <UrduInput
            value={form.guardianNameUr}
            onChange={(val) => onUpdate("guardianNameUr", val)}
            placeholder="احمد خان"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Relationship">
          <Select
            value={form.guardianRelationship}
            onChange={(e) => onUpdate("guardianRelationship", e.target.value)}
          >
            <option value="">Select relationship</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Occupation">
          <Input
            value={form.guardianOccupation}
            onChange={(e) => onUpdate("guardianOccupation", e.target.value)}
            placeholder="Engineer, Doctor, Teacher..."
          />
        </FieldGroup>
      </div>

      </FormSection>

      <FormSection icon={MapPin} title="How to reach them" hint="Used for fee reminders, attendance alerts and the parent portal invite.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Guardian Phone (WhatsApp)">
          <Input
            value={form.guardianPhone}
            onChange={(e) => onUpdate("guardianPhone", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
        <FieldGroup label="Guardian WhatsApp (if different)">
          <Input
            value={form.guardianWhatsapp}
            onChange={(e) => onUpdate("guardianWhatsapp", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Guardian Email" error={errors.guardianEmail} hint="Sends a parent portal invite">
        <Input
          type="email"
          value={form.guardianEmail}
          onChange={(e) => onUpdate("guardianEmail", e.target.value)}
          placeholder="guardian@example.com"
        />
      </FieldGroup>
      </FormSection>
    </div>
  );
}

// ─── Step 3: Address & Medical ────────────────────────────

function StepAddressMedical({
  form,
  errors,
  onUpdate,
}: {
  form: FormData;
  errors: FormErrors;
  onUpdate: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <FormSection icon={MapPin} title="Address" hint="Where the student lives. Printed on official records.">
        <>
          <FieldGroup label="Street Address">
            <Input
              value={form.address}
              onChange={(e) => onUpdate("address", e.target.value)}
              placeholder="123 Mosque Lane"
            />
          </FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldGroup label="City">
              <Input
                value={form.city}
                onChange={(e) => onUpdate("city", e.target.value)}
                placeholder="Lahore"
              />
            </FieldGroup>
            <FieldGroup label="Province">
              <Select
                value={form.province}
                onChange={(e) => onUpdate("province", e.target.value)}
              >
                <option value="">Select province</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Postal Code">
              <Input
                value={form.postalCode}
                onChange={(e) => onUpdate("postalCode", e.target.value)}
                placeholder="54000"
              />
            </FieldGroup>
          </div>
        </>
      </FormSection>

      <FormSection
        icon={Heart}
        title="Medical Information"
        hint="Anything staff must know in an emergency. Visible to teachers and the school office."
      >
        <>
          <FieldGroup label="Medical Notes">
            <Textarea
              value={form.medicalNotes}
              onChange={(e) => onUpdate("medicalNotes", e.target.value)}
              placeholder="Any medical conditions or notes..."
              rows={2}
            />
          </FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Allergies">
              <Input
                value={form.allergies}
                onChange={(e) => onUpdate("allergies", e.target.value)}
                placeholder="Peanuts, Dairy, Gluten..."
              />
            </FieldGroup>
            <FieldGroup label="Current Medications">
              <Input
                value={form.medications}
                onChange={(e) => onUpdate("medications", e.target.value)}
                placeholder="None"
              />
            </FieldGroup>
          </div>
          <FieldGroup label="Special Needs">
            <Textarea
              value={form.specialNeeds}
              onChange={(e) => onUpdate("specialNeeds", e.target.value)}
              placeholder="Physical disability, learning support, hearing/vision impairment..."
              rows={2}
            />
          </FieldGroup>
        </>
      </FormSection>
    </div>
  );
}

// ─── Step 4: Review & Submit ──────────────────────────────

function StepReview({
  form,
  selectedClass,
  age,
  tags,
  siblings,
  onEditStep,
}: {
  form: FormData;
  selectedClass: ClassRecord | undefined;
  age: number | null;
  tags: { categories: any[]; groups: any[] };
  siblings: any[];
  onEditStep: (step: number) => void;
}) {
  const classDisplay = selectedClass
    ? [selectedClass.name, selectedClass.section].filter(Boolean).join(" - ")
    : "Not selected";

  return (
    <div className="space-y-4">
      <ReviewHero
        icon={GraduationCap}
        eyebrow="Ready to admit"
        title={form.fullName || "Unnamed student"}
        meta={[form.rollNo || "No roll number", classDisplay, age !== null ? `${age} yrs` : null]
          .filter(Boolean)
          .join(" · ")}
      />
      <p className="px-1 text-xs font-semibold text-ink-muted">
        Check each section below. Anything wrong can be corrected with <b>Edit</b> — after submitting, changes are
        made from the student&apos;s profile.
      </p>

      <ReviewSection
        title="Student Information"
        icon={User}
        onEdit={() => onEditStep(0)}
      >
        <ReviewRow label="Name (English)" value={form.fullName} required />
        {form.nameUr && <ReviewRow label="Name (Urdu)" value={form.nameUr} dir="rtl" />}
        <ReviewRow label="Roll Number" value={form.rollNo} required />
        <ReviewRow
          label="Class"
          value={classDisplay}
        />
        <ReviewRow
          label="Date of Birth"
          value={
            form.dateOfBirth
              ? `${new Date(form.dateOfBirth).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}${age !== null ? ` (${age} yrs)` : ""}`
              : ""
          }
        />
        <ReviewRow label="Gender" value={form.gender === "MALE" ? "Male" : form.gender === "FEMALE" ? "Female" : "Other"} />
        {form.bloodType && <ReviewRow label="Blood Type" value={form.bloodType} />}
        {form.nationality && <ReviewRow label="Nationality" value={form.nationality} />}
        {form.phone && <ReviewRow label="Phone" value={form.phone} />}
        {form.studentEmail && <ReviewRow label="Student Email" value={form.studentEmail} />}
        {form.previousSchool && <ReviewRow label="Previous School" value={form.previousSchool} />}
        {form.categoryId || form.groupId ? (
          <>
            <ReviewRow
              label="Category"
              value={tags.categories.find((c) => c.id === form.categoryId)?.name || "None"}
            />
            <ReviewRow
              label="Group"
              value={tags.groups.find((g) => g.id === form.groupId)?.name || "None"}
            />
          </>
        ) : null}
        {form.siblingStudentId ? (
          <ReviewRow label="Sibling link" value={siblings.find((s) => s.id === form.siblingStudentId)?.fullName || "Selected sibling"} />
        ) : null}
      </ReviewSection>

      <ReviewSection
        title="Guardian Information"
        icon={Users}
        onEdit={() => onEditStep(1)}
      >
        {form.guardianName ? (
          <>
            <ReviewRow label="Name" value={form.guardianName} />
            {form.guardianRelationship && (
              <ReviewRow
                label="Relationship"
                value={RELATIONSHIPS.find((r) => r.value === form.guardianRelationship)?.label || form.guardianRelationship}
              />
            )}
            {form.guardianPhone && <ReviewRow label="Phone" value={form.guardianPhone} />}
            {form.guardianEmail && <ReviewRow label="Email" value={form.guardianEmail} />}
            {form.guardianOccupation && (
              <ReviewRow label="Occupation" value={form.guardianOccupation} />
            )}
          </>
        ) : (
          <p className="text-sm text-ink-subtle">No guardian details provided</p>
        )}
      </ReviewSection>

      <ReviewSection
        title="Address & Medical"
        icon={MapPin}
        onEdit={() => onEditStep(2)}
      >
        {form.address || form.city || form.province ? (
          <ReviewRow
            label="Address"
            value={[form.address, form.city, form.province, form.postalCode]
              .filter(Boolean)
              .join(", ")}
          />
        ) : (
          <p className="text-sm text-ink-subtle">No address provided</p>
        )}
        {form.allergies && <ReviewRow label="Allergies" value={form.allergies} />}
        {form.medicalNotes && <ReviewRow label="Medical Notes" value={form.medicalNotes} />}
        {form.specialNeeds && <ReviewRow label="Special Needs" value={form.specialNeeds} />}
        {form.medications && <ReviewRow label="Medications" value={form.medications} />}
        {!form.allergies && !form.medicalNotes && !form.specialNeeds && !form.medications && !form.address && !form.city && (
          <p className="text-sm text-ink-subtle">No medical information provided</p>
        )}
      </ReviewSection>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────


function FieldGroup({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="block pl-1 text-[9px] font-black uppercase tracking-wider text-ink-subtle">{label}</Label>
      {children}
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
      {hint && !error && <p className="text-xs font-medium text-ink-muted">{hint}</p>}
    </div>
  );
}


