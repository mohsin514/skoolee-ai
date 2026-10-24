"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { URDU_KEYS } from "@/lib/urdu";

export function UrduInput({
  value,
  onChange,
  placeholder,
  textarea = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  textarea?: boolean;
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
        {textarea ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            dir="rtl"
            lang="ur"
            rows={3}
            className="flex-1 text-sm"
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            dir="rtl"
            lang="ur"
            className="flex-1"
          />
        )}
        <button
          type="button"
          className={`shrink-0 rounded-xl px-2.5 transition-all ${
            showKeyboard
              ? "bg-primary text-white shadow-lg shadow-primary/20"
              : "bg-muted text-ink-muted hover:bg-brand-50 hover:text-primary"
          }`}
          onClick={() => setShowKeyboard(!showKeyboard)}
          title="Urdu keyboard"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {showKeyboard && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-edge/25 bg-white p-2.5 shadow-xl shadow-black/10">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-2xs font-bold text-ink-muted">اردو کی بورڈ</span>
            <button
              type="button"
              className="rounded-lg p-0.5 text-ink-subtle hover:text-primary"
              onClick={() => setShowKeyboard(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {URDU_KEYS.map((row, ri) => (
            <div key={ri} className="mb-0.5 flex gap-0.5">
              {row.map((char, ci) => (
                <button
                  key={ci}
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-all ${
                    char === " "
                      ? "bg-muted text-2xs text-ink-subtle hover:bg-brand-50"
                      : "bg-muted text-ink-strong hover:bg-primary hover:text-white active:scale-95"
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
              className="flex-1 rounded-lg bg-muted py-1.5 text-2xs font-bold text-ink-muted hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange(value.slice(0, -1))}
            >
              ← Backspace
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-muted py-1.5 text-2xs font-bold text-ink-muted hover:bg-red-50 hover:text-red-500 active:scale-95"
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
