"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FIXED_GAZE, caretRatio, gazeVector, type MascotFocus, type MascotMood } from "@/lib/auth/mascot-mood";

/**
 * Internal to AuthMascot. Watches the page around the mascot through
 * delegated listeners on the enclosing <main> and steers the eyes
 * imperatively (CSS custom properties on the logo root). React state changes
 * only when the focus KIND or Caps Lock changes — never per keystroke.
 *
 * - Text fields: the pupils follow an estimate of the caret.
 * - Password fields: the lids close (shy) or one peeks (revealed). Typing in
 *   them never moves the eyes, so typing rhythm is never mirrored.
 * - `[data-mascot-look]` elements draw the gaze on hover or focus.
 */

type Point = { x: number; y: number };

export type MascotWatch = {
  focus: MascotFocus;
  capsLock: boolean;
  /** Tell the watcher the resolved mood (fixed gazes, the cooldown anchor). */
  setMood: (mood: MascotMood) => void;
  /** Look at an element (or a selector inside <main>) for `holdMs`, then return. */
  glance: (target: Element | string, holdMs: number) => void;
  /** The concerned double-take at the first alert: glance, blink, hold, return. */
  concernedGlance: () => void;
  /** Set a data attribute on the logo root for `ms` (one-shot animations). */
  pulse: (name: "data-hop" | "data-celebrate" | "data-entrance", value: string, ms: number) => void;
};

const TEXT_TYPES = new Set(["", "text", "email", "search", "tel", "url", "number"]);
const CONTROL = "a[href], button, select, summary, [role='button'], [role='radio'], [role='checkbox'], [role='switch'], [role='tab'], [role='link'], [role='option'], [role='menuitem'], [role='combobox']";
const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"]);

type Classified = { kind: MascotFocus; field: HTMLInputElement | HTMLTextAreaElement | null };

const isSecretInput = (input: HTMLInputElement) =>
  (input.type === "password" || input.type === "text") && (input.type === "password" || (input.getAttribute("autocomplete") ?? "").includes("password"));

function classify(el: Element | null): Classified {
  if (!el || el === document.body || el === document.documentElement) return { kind: "none", field: null };
  if (el instanceof HTMLInputElement) {
    if (isSecretInput(el)) return { kind: el.type === "password" ? "secret" : "secret-revealed", field: el };
    if (TEXT_TYPES.has(el.type)) return { kind: "field", field: el };
    return { kind: "control", field: null };
  }
  if (el instanceof HTMLTextAreaElement) return { kind: "field", field: el };
  // A reveal/clear action inside a password group keeps the password pose (peek stays while it has focus).
  const group = el.closest(".sk-input-group");
  if (group) {
    const input = group.querySelector("input");
    if (input && isSecretInput(input)) return { kind: input.type === "password" ? "secret" : "secret-revealed", field: input };
  }
  if (el.matches(CONTROL) || el.hasAttribute("data-mascot-look")) return { kind: "control", field: null };
  if (el instanceof HTMLElement && el.isContentEditable) return { kind: "field", field: null };
  return { kind: "none", field: null };
}

const centre = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

function caretPoint(field: HTMLInputElement | HTMLTextAreaElement): Point {
  const rect = field.getBoundingClientRect();
  let position: number | null = null;
  try { position = field.selectionStart; } catch { position = null; }
  const ratio = caretRatio(position, field.value.length);
  const span = Math.max(0, rect.width - 24) * ratio;
  const rtl = getComputedStyle(field).direction === "rtl";
  return { x: rtl ? rect.right - 12 - span : rect.left + 12 + span, y: rect.top + rect.height / 2 };
}

const format = (n: number) => String(Math.round(n * 1000) / 1000);

function createController(logo: HTMLElement, main: HTMLElement, reduced: boolean, setFocus: (f: MascotFocus) => void, setCaps: (c: boolean) => void) {
  let mood: MascotMood = "idle";
  let active: Element | null = null;
  let activeKind: Classified = { kind: "none", field: null };
  let hovered: Element | null = null;
  let tracked: Point = { x: 0, y: 0 };
  let override: Point | null = null;
  let frame = 0;
  let glanceTimer = 0;
  let blinkTimer = 0;
  const timers = new Set<number>();
  const frames = new Set<number>();

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const rtl = () => getComputedStyle(main).direction === "rtl";
  const logoCentre = () => centre(logo.getBoundingClientRect());
  const gazeAt = (point: Point) => gazeVector(logoCentre(), point);

  function write(p: Point) {
    logo.style.setProperty("--sk-gaze-x", format(p.x));
    logo.style.setProperty("--sk-gaze-y", format(p.y));
  }

  function apply() {
    let p: Point | null = override;
    if (!p) {
      const fixed = FIXED_GAZE[mood];
      if (fixed) p = mood === "thinking" && rtl() ? { x: -fixed.x, y: fixed.y } : fixed;
    }
    if (!p && mood === "waiting") {
      const anchor = main.querySelector("[data-mascot-anchor='cooldown']");
      if (anchor) p = gazeAt(centre(anchor.getBoundingClientRect()));
    }
    write(p ?? tracked);
  }

  /** Where the eyes rest for the current focus/hover. Passwords: the field, never the caret. */
  function track(caret: boolean) {
    if (hovered) {
      tracked = gazeAt(centre(hovered.getBoundingClientRect()));
    } else if (active && activeKind.kind !== "none") {
      const { kind, field } = activeKind;
      if (field && kind === "field" && caret) tracked = gazeAt(caretPoint(field));
      else tracked = gazeAt(centre((field ?? active).getBoundingClientRect()));
    } else {
      tracked = { x: 0, y: 0 };
    }
    apply();
  }

  function schedule(caret: boolean) {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { frame = 0; track(caret); });
  }

  function publishFocus() {
    setFocus(activeKind.kind !== "none" ? activeKind.kind : hovered ? "control" : "none");
  }

  function setActive(el: Element | null) {
    active = el;
    activeKind = classify(el);
    publishFocus();
  }

  const onFocusIn = (event: FocusEvent) => {
    setActive(event.target as Element);
    schedule(true);
  };
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && main.contains(next)) return; // focusin on the next element handles it
    setActive(null);
    schedule(false);
  };
  const onInput = (event: Event) => {
    if (reduced || event.target !== active || activeKind.kind !== "field") return;
    schedule(true);
  };
  const onKey = (event: KeyboardEvent) => {
    if (typeof event.getModifierState === "function") setCaps(event.getModifierState("CapsLock"));
    if (!reduced && event.type === "keyup" && CARET_KEYS.has(event.key) && activeKind.kind === "field") schedule(true);
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    // A reveal toggle flips the input type after this click: re-read it next frame.
    if (target?.closest?.("[aria-controls]")) {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        setActive(document.activeElement && main.contains(document.activeElement) ? document.activeElement : active);
        schedule(false);
      });
      frames.add(id);
      return;
    }
    if (!reduced && activeKind.kind === "field") schedule(true);
  };
  const onPointerOver = (event: PointerEvent) => {
    const look = (event.target as Element | null)?.closest?.("[data-mascot-look]");
    if (!look || look === hovered || !main.contains(look)) return;
    hovered = look;
    publishFocus();
    schedule(false);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!hovered) return;
    const next = event.relatedTarget as Node | null;
    if (next && hovered.contains(next)) return;
    hovered = null;
    publishFocus();
    schedule(true);
  };

  function blink(holdMs: number) {
    if (reduced) return;
    logo.setAttribute("data-blink", "");
    logo.setAttribute("data-blink-settle", "");
    later(() => logo.removeAttribute("data-blink"), holdMs);
    later(() => logo.removeAttribute("data-blink-settle"), holdMs + 90);
  }

  /** Natural blinking: idle and attentive only, every 3.5–7s, 12% doubles; paused while hidden. */
  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (reduced || document.hidden) return;
    blinkTimer = window.setTimeout(() => {
      if (!document.hidden && (mood === "idle" || mood === "attentive")) {
        blink(140);
        if (Math.random() < 0.12) later(() => blink(140), 260);
      }
      scheduleBlink();
    }, 3500 + Math.random() * 3500);
  }
  const onVisibility = () => scheduleBlink();

  function glance(target: Element | string, holdMs: number) {
    if (reduced) return;
    let el: Element | null = null;
    try { el = typeof target === "string" ? main.querySelector(target) : target; } catch { el = null; }
    if (!el) return;
    override = gazeAt(centre(el.getBoundingClientRect()));
    apply();
    window.clearTimeout(glanceTimer);
    glanceTimer = window.setTimeout(() => { override = null; apply(); }, holdMs);
  }

  const listeners: [string, EventListener, boolean][] = [
    ["focusin", onFocusIn as EventListener, false],
    ["focusout", onFocusOut as EventListener, false],
    ["input", onInput, false],
    ["select", onInput, false],
    ["keydown", onKey as EventListener, false],
    ["keyup", onKey as EventListener, false],
    ["click", onClick as EventListener, true],
    ["pointerover", onPointerOver as EventListener, false],
    ["pointerout", onPointerOut as EventListener, false],
  ];
  for (const [type, listener, capture] of listeners) main.addEventListener(type, listener, capture);
  document.addEventListener("visibilitychange", onVisibility);
  scheduleBlink();

  // Something may already be focused (autofocus, a focused heading) when we mount.
  if (document.activeElement && document.activeElement !== document.body && main.contains(document.activeElement)) {
    setActive(document.activeElement);
    schedule(false);
  }

  return {
    setMood(next: MascotMood) {
      mood = next;
      apply();
    },
    glance,
    concernedGlance() {
      if (reduced) return;
      const alert = main.querySelector("[role='alert'], #login-error");
      if (!alert) return;
      // to the alert (160ms CSS transition) → blink on arrival → hold → back.
      glance(alert, 660);
      later(() => blink(200), 170);
    },
    pulse(name: string, value: string, ms: number) {
      if (reduced) return;
      logo.removeAttribute(name);
      // Re-applying in the next frame restarts the animation if it was mid-flight.
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        logo.setAttribute(name, value);
        later(() => logo.removeAttribute(name), ms);
      });
      frames.add(id);
    },
    dispose() {
      for (const [type, listener, capture] of listeners) main.removeEventListener(type, listener, capture);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) cancelAnimationFrame(frame);
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      window.clearTimeout(glanceTimer);
      window.clearTimeout(blinkTimer);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const name of ["data-blink", "data-blink-settle", "data-hop", "data-celebrate", "data-entrance"]) logo.removeAttribute(name);
      logo.style.removeProperty("--sk-gaze-x");
      logo.style.removeProperty("--sk-gaze-y");
    },
  };
}

type Controller = ReturnType<typeof createController>;

export function useMascotWatch(logoRef: RefObject<HTMLSpanElement | null>, opts: { reduced: boolean }): MascotWatch {
  const [focus, setFocus] = useState<MascotFocus>("none");
  const [capsLock, setCapsLock] = useState(false);
  const controller = useRef<Controller | null>(null);
  const { reduced } = opts;

  useEffect(() => {
    const logo = logoRef.current;
    const main = logo?.closest("main");
    if (!logo || !main) return;
    const instance = createController(logo, main, reduced, setFocus, setCapsLock);
    controller.current = instance;
    return () => {
      instance.dispose();
      if (controller.current === instance) controller.current = null;
    };
  }, [logoRef, reduced]);

  const api = useMemo(() => ({
    setMood: (mood: MascotMood) => controller.current?.setMood(mood),
    glance: (target: Element | string, holdMs: number) => controller.current?.glance(target, holdMs),
    concernedGlance: () => controller.current?.concernedGlance(),
    pulse: (name: "data-hop" | "data-celebrate" | "data-entrance", value: string, ms: number) => controller.current?.pulse(name, value, ms),
  }), []);

  return { focus, capsLock, ...api };
}
