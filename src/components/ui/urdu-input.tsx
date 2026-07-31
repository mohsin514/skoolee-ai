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
              ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
              : "bg-[#f3f4f9] text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
          }`}
          onClick={() => setShowKeyboard(!showKeyboard)}
          title="Urdu keyboard"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {showKeyboard && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-[#cfc2d6]/25 bg-white p-2.5 shadow-xl shadow-black/10">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-[#4d4354]/50">اردو کی بورڈ</span>
            <button
              type="button"
              className="rounded-lg p-0.5 text-[#4d4354]/30 hover:text-[#8127cf]"
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
                      ? "bg-[#f3f4f9] text-[10px] text-[#4d4354]/40 hover:bg-[#fbf0fe]"
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
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-[#4d4354]/60 hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange(value.slice(0, -1))}
            >
              ← Backspace
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-[#4d4354]/60 hover:bg-red-50 hover:text-red-500 active:scale-95"
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
