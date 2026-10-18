"use client";
import { InputGroup } from "@/components/ui/input-group";


import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogBehaviour } from "@/components/ui/modal";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Search, UserRoundSearch, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel, type UserRole } from "@/lib/roles";
import { useChat } from "./chat-provider";
import { ChatAvatar } from "./chat-avatar";
import { ChatPortal } from "./chat-portal";
import type { DirectoryContact } from "@/lib/chat/types";
import { Input as SystemInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { fill } from "./chat-text";


/**
 * Grouping order — leadership first, families last, which is roughly how often
 * each is the person being looked for.
 *
 * Sections are keyed on the *label*, not the role enum, because ADMIN is a
 * legacy alias of CAMPUS_ADMIN and both render as "Campus Admin". Keyed on the
 * enum, a campus admin saw two identical "Campus Admin" headings and
 * reasonably concluded one of them was their own account — it never is: the
 * directory endpoint excludes the caller, and this list filters them again.
 */
const ROLE_ORDER: UserRole[] = [
  "SUPER_ADMIN",
  "CAMPUS_ADMIN",
  "ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "ACCOUNTANT",
  "LIBRARIAN",
  "RECEPTIONIST",
  "PARENT",
  "STUDENT",
];

const LABEL_ORDER: string[] = [];
for (const role of ROLE_ORDER) {
  const label = roleLabel(role);
  if (!LABEL_ORDER.includes(label)) LABEL_ORDER.push(label);
}

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewConversationDialog({ open, onClose }: NewConversationDialogProps) {
  const { viewer, searchDirectory, startDirect, createGroup } = useChat();
  const ui = useUiText();
  const { language } = useLocale();

  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [selected, setSelected] = useState<DirectoryContact[]>([]);
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreateGroup = viewer?.canCreateGroup ?? false;

  /**
   * The sheet's presentation was already right — a real bottom sheet on a
   * phone, a spring on the way in, an exit that plays. What it did not have was
   * a focus trap, a scroll lock, or a layer that clears the app chrome: it sat
   * at `z-[100]` while the account menus sit at `z-[999]`, so opening it from
   * the header put it underneath the menu that opened it. Escape was its own
   * window listener, which fired even when a confirm was stacked on top.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const { z } = useDialogBehaviour(panelRef, { onClose, active: open });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected([]);
      setTitle("");
      setMode("direct");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      const results = await searchDirectory(query);
      if (!cancelled) {
        setContacts(results);
        setIsLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, searchDirectory]);

  const grouped = useMemo(() => {
    // The endpoint already excludes the caller. Filtered again here so a stale
    // viewer, or a future change to that endpoint, can never put someone in a
    // position to open a conversation with themselves — which the API would
    // refuse anyway, but only after a confusing round trip.
    const reachable = contacts.filter((c) => c.id !== viewer?.id);

    const buckets = new Map<string, DirectoryContact[]>();
    for (const contact of reachable) {
      const label = roleLabel(contact.role);
      const list = buckets.get(label) ?? [];
      list.push(contact);
      buckets.set(label, list);
    }

    // Bucketed on the English label (see LABEL_ORDER); shown in the reader's language.
    return LABEL_ORDER.filter((label) => buckets.has(label)).map((label) => ({
      label,
      heading: roleLabel(buckets.get(label)![0].role, language),
      contacts: buckets.get(label)!,
    }));
  }, [contacts, viewer?.id, language]);

  const total = grouped.reduce((n, g) => n + g.contacts.length, 0);

  async function choose(contact: DirectoryContact) {
    if (mode === "group") {
      setSelected((prev) =>
        prev.some((c) => c.id === contact.id)
          ? prev.filter((c) => c.id !== contact.id)
          : [...prev, contact]
      );
      return;
    }

    setIsSubmitting(true);
    const id = await startDirect(contact.id);
    setIsSubmitting(false);
    if (id) onClose();
  }

  async function submitGroup() {
    if (selected.length === 0 || !title.trim()) return;

    setIsSubmitting(true);
    const id = await createGroup({
      kind: "GROUP",
      title: title.trim(),
      memberIds: selected.map((c) => c.id),
    });
    setIsSubmitting(false);
    if (id) onClose();
  }

  return (
    <ChatPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ zIndex: z }}
            className="fixed inset-0 flex items-end justify-center bg-ink-strong/45 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-conversation-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-8px_60px_-12px_rgba(31,26,35,0.4)] sm:max-h-[82vh] sm:rounded-[28px] sm:shadow-[0_30px_80px_-20px_rgba(31,26,35,0.5)]"
            >
              {/* ── Head ── */}
              <header className="relative shrink-0 overflow-hidden border-b border-edge/25 bg-gradient-to-br from-white via-white to-brand-50/70 px-5 pb-4 pt-4">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -end-12 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
                />

                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-berry text-white shadow-[0_8px_20px_-8px_rgba(129,39,207,0.75)]">
                      <UserRoundSearch className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2
                        id="new-conversation-title"
                        className="truncate text-sm font-bold tracking-tight text-ink-strong"
                      >
                        {mode === "group" ? ui("New group") : ui("New conversation")}
                      </h2>
                      <p className="truncate text-2xs font-semibold text-ink-muted">
                        {total === 1 ? ui("{0} person you can reach", [total]) : ui("{0} people you can reach", [total])}
                      </p>
                    </div>
                  </div>

                  <Button variant="secondary" size="icon"
                    type="button"
                    onClick={onClose}
                    aria-label={ui("Close")}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Who you are, stated on the screen where it matters.
                    Several roles share a display label — ADMIN and
                    CAMPUS_ADMIN both read as "Campus Admin" — so a colleague
                    of the same rank looks exactly like your own account. You
                    are never listed below, but without seeing your own name
                    here there was no way to confirm that. */}
                {viewer && (
                  <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-2 ring-1 ring-edge/30">
                    <ChatAvatar
                      name={viewer.fullName}
                      seed={viewer.id}
                      size="sm"
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-2xs font-bold text-ink-strong">
                        <bdi>{viewer.fullName}</bdi>
                      </span>
                      <span className="block truncate text-2xs font-semibold text-ink-muted">
                        {fill(ui("Signed in as {0} · you are not in this list"), [roleLabel(viewer.role, language)])}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-white">
                      {ui("You")}
                    </span>
                  </div>
                )}
              </header>

              {/* ── Controls ── */}
              <div className="shrink-0 space-y-3 border-b border-edge/25 px-5 py-4">
                {canCreateGroup && (
                  <div
                    className="relative flex gap-1 rounded-xl bg-[#f4ecf8]/70 p-1"
                    role="tablist"
                    aria-label={ui("Conversation type")}
                  >
                    {(["direct", "group"] as const).map((m) => (
                      <Button data-selected={mode === m} variant="choice" size="sm"
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => {
                          setMode(m);
                          setSelected([]);
                        }}
                        className="relative flex-1"
                      >

                        <span className="relative">{m === "direct" ? ui("One to one") : ui("Group")}</span>
                      </Button>
                    ))}
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {mode === "group" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <label className="sr-only" htmlFor="group-title">
                        {ui("Group name")}
                      </label>
                      <SystemInput
                        id="group-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={ui("Group name — e.g. Grade 6 Teachers")}
                        maxLength={120}
                        className="w-full px-3 py-2.5"
                      />
                      {selected.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5">
                          {selected.map((c) => (
                            <motion.li
                              key={c.id}
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-1 rounded-full bg-brand-50 py-0.5 ps-0.5 pe-1.5 text-2xs font-bold text-primary ring-1 ring-primary/20"
                            >
                              <ChatAvatar name={c.fullName} seed={c.id} size="sm" className="scale-[0.78]" />
                              <bdi className="max-w-[110px] truncate">{c.fullName}</bdi>
                              <Button variant="outline" size="icon"
                                type="button"
                                aria-label={ui("Remove {0}", [c.fullName])}
                                onClick={() => setSelected((prev) => prev.filter((s) => s.id !== c.id))}

                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
                            </motion.li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <InputGroup surfaceClassName="bg-white" className="relative">
                  <Search data-field-affix="start"
                    className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                    aria-hidden
                  />
                  <label className="sr-only" htmlFor="directory-search">
                    {ui("Search people")}
                  </label>
                  <SystemInput
                    id="directory-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={ui("Search by name")}
                    className="w-full py-2.5 ps-9 pe-3"
                  />
                </InputGroup>
              </div>

              {/* ── Directory ──
                  The list is a scroll container inside a rounded card. Without
                  the padding and the fade below, the bottom row is sliced by the
                  corner radius and reads as a broken layout rather than as
                  "there is more below". */}
              {/* The scroller stays IN FLOW (a flex child with min-h-0), which is
                  what lets the card hug a short list and only cap at max-height
                  once the list is long. Taking it out of flow — absolute, or a
                  percentage height — leaves the flex track with nothing to size
                  from and collapses the card. The fade is the only absolutely
                  positioned piece, and this wrapper is its containing block. */}
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
                  {isLoading ? (
                    <p className="flex items-center justify-center gap-2 py-12 text-xs font-bold text-ink-muted">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {ui("Loading your contacts")}
                    </p>
                  ) : total === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
                      <span className="sk-float grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-primary to-berry text-white shadow-[0_16px_36px_-14px_rgba(129,39,207,0.75)]">
                        <Users className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-ink-strong">
                          {query ? ui("Nobody matches that") : ui("No contacts available")}
                        </p>
                        <p className="mt-1 max-w-[260px] text-2xs font-semibold leading-relaxed text-ink-muted">
                          {query
                            ? ui("Try a different name.")
                            : ui("Your school decides who you can message. Contact the office if someone is missing.")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    grouped.map((group) => (
                      <section key={group.label}>
                        <h3 className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-edge/20 bg-white/95 px-5 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint backdrop-blur-md">
                          {group.heading}
                          <span className="font-bold text-ink-faint/70">{group.contacts.length}</span>
                        </h3>

                        <ul className="px-2 py-1">
                          {group.contacts.map((contact) => {
                            const isSelected = selected.some((s) => s.id === contact.id);
                            return (
                              <li key={contact.id}>
                                <Button variant="choice" aria-pressed={mode === "group" ? isSelected : undefined}
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => choose(contact)}
                                  className="flex justify-start w-full items-center gap-3 text-start"
                                >
                                  <ChatAvatar
                                    name={contact.fullName}
                                    seed={contact.id}
                                    imageUrl={contact.profileImageUrl}
                                    size="md"
                                  />

                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold text-ink-strong">
                                      <bdi>{contact.fullName}</bdi>
                                    </span>
                                    {/* Never the bare role label — it only
                                        repeats the heading above and leaves two
                                        colleagues of the same rank
                                        indistinguishable. The email is the
                                        identifier a school actually recognises,
                                        so a second "Campus Admin" is visibly
                                        somebody else. */}
                                    {(contact.context ?? contact.email ?? contact.campusName) && (
                                      <span className="block truncate text-2xs font-semibold text-ink-muted">
                                        <bdi>{contact.context ?? contact.email ?? contact.campusName}</bdi>
                                      </span>
                                    )}
                                  </span>

                                  {mode === "group" && (
                                    <span
                                      className={cn(
                                        "grid h-5 w-5 shrink-0 place-items-center rounded-lg border transition-all",
                                        isSelected
                                          ? "border-primary bg-gradient-to-br from-primary to-brand-400 text-white shadow-[0_4px_12px_-4px_rgba(129,39,207,0.7)]"
                                          : "border-edge/60"
                                      )}
                                      aria-hidden
                                    >
                                      {isSelected && <Check className="sk-check-pop h-3 w-3" />}
                                    </span>
                                  )}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </div>

                {/* Covers the last few pixels of the list so a row scrolling out
                    fades instead of being cut. Non-interactive. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent"
                />
              </div>

              {mode === "group" && (
                <footer className="shrink-0 border-t border-edge/25 bg-white px-5 py-4">
                  <Button variant="default" size="sm"
                    type="button"
                    onClick={submitGroup}
                    disabled={selected.length === 0 || !title.trim() || isSubmitting}
                    className="w-full hover:-translate-y-0.5"
                  >
                    {isSubmitting
                      ? ui("Creating…")
                      : selected.length
                        ? ui("Create group · {0}", [selected.length])
                        : ui("Create group")}
                  </Button>
                </footer>
              )}
            </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </ChatPortal>
  );
}
