"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Wallet, MessageCircleMore, CalendarCheck2, LucideIcon } from "lucide-react";
import styles from "./LiveActivityTicker.module.css";

const EVENTS: { icon: LucideIcon; text: string }[] = [
  { icon: ClipboardCheck, text: "Report card sent to a parent" },
  { icon: Wallet, text: "Fee payment confirmed — Grade 6B" },
  { icon: MessageCircleMore, text: "WhatsApp update delivered" },
  { icon: CalendarCheck2, text: "Attendance marked for 8 classes" },
];

/**
 * A small cycling chip that dramatizes the "32 live event types" claim on
 * the auth brand panel — quietly reinforces the product story with motion
 * instead of another static line of copy.
 */
export default function LiveActivityTicker({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((v) => (v + 1) % EVENTS.length), 3400);
    return () => clearInterval(id);
  }, []);

  const { icon: Icon, text } = EVENTS[index];

  return (
    <div
      aria-hidden="true"
      className={`inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-[#3d0f6b]/50 px-3.5 py-2 shadow-lg backdrop-blur-md ${className}`}
    >
      <span key={index} className={`flex items-center gap-2 ${styles.item}`}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <span className="whitespace-nowrap text-[11px] font-bold text-white/90">{text}</span>
      </span>
    </div>
  );
}
