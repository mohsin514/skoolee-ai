import type React from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { InputGroup } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";

/** A field's validation message: an icon and the text, linked to its control by id. */
export function FieldError({ id, live = true, children }: { id?: string; live?: boolean; children: React.ReactNode }) {
  return (
    <p id={id} role={live ? "alert" : undefined} className="sk-field-message flex items-start gap-1.5 text-sm font-medium leading-snug text-destructive">
      <AlertCircle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function InputField({ field, error, label, value, onChange, placeholder, icon: Icon, isArea, required, readonly, type = "text", inputMode, hint }: {
  field: string; error?: string; label: string; value: string; onChange: (val: string) => void; placeholder: string; icon: LucideIcon;
  isArea?: boolean; required?: boolean; readonly?: boolean; type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'none' | 'decimal';
  /** Format, example or consequence, shown under the control and read after the error. */
  hint?: string;
}) {
  const id = `field-${field}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5" data-form-field={field}>
      <Label htmlFor={id} className="sk-field-label">
        {label} {required && <span className="text-destructive" aria-hidden="true">*</span>}
      </Label>
      <InputGroup>
        {type !== "date" && <Icon data-field-affix="start" className="h-4 w-4" />}
        {isArea ? (
          <SystemTextarea id={id} aria-required={required} aria-invalid={!!error} aria-describedby={describedBy}
            value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full min-h-[90px] resize-none" />
        ) : (
          <Input id={id} aria-required={required} aria-invalid={!!error} aria-describedby={describedBy}
            dir={["email", "tel", "url", "date"].includes(type) ? "ltr" : undefined}
            type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} readOnly={readonly} inputMode={inputMode} className="w-full" />
        )}
      </InputGroup>
      {error && <FieldError id={`${id}-error`} live={false}>{error}</FieldError>}
      {hint && <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-subtle">{hint}</p>}
    </div>
  );
}

export function SummaryItem({ icon: Icon, label, value, ltr }: { icon: LucideIcon; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 md:p-4 bg-surface-subtle rounded-2xl border border-border-subtle min-w-0">
      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-primary shrink-0 shadow-xs ring-1 ring-border-subtle">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="sk-eyebrow mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-ink-strong break-words">{ltr ? <bdi dir="ltr">{value || '—'}</bdi> : (value || '—')}</p>
      </div>
    </div>
  );
}
