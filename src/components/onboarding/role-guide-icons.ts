import { BookOpen, BookMarked, Building2, CalendarDays, ClipboardCheck, GraduationCap, HeartHandshake, Library, ListChecks, MessagesSquare, Network, NotebookPen, ReceiptText, School, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import type { UserRole } from "@/lib/roles";

/** Shared visual vocabulary for each person's work, independent of access decisions. */
export const roleGuideIcons: Record<UserRole, readonly [LucideIcon, LucideIcon, LucideIcon]> = {
  SUPER_ADMIN: [Building2, Network, Users],
  ADMIN: [Users, ListChecks, CalendarDays],
  CAMPUS_ADMIN: [School, ClipboardCheck, Network],
  PRINCIPAL: [GraduationCap, BookOpen, ClipboardCheck],
  TEACHER: [NotebookPen, BookOpen, CalendarDays],
  STUDENT: [BookOpen, CalendarDays, GraduationCap],
  PARENT: [HeartHandshake, CalendarDays, MessagesSquare],
  ACCOUNTANT: [ReceiptText, Wallet, ClipboardCheck],
  LIBRARIAN: [Library, BookMarked, Users],
  RECEPTIONIST: [MessagesSquare, Users, ClipboardCheck],
  APP_OWNER: [Network, ShieldCheck, Building2],
};
