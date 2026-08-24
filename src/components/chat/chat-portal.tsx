"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders into document.body.
 *
 * A modal must not be a descendant of the surface that opened it. The docked
 * messenger is a framer-motion element, so it always carries a `transform` —
 * and a transformed ancestor becomes the containing block for any
 * `position: fixed` child. Rendered in place, the dialog's `inset-0` resolved
 * to the 400x600 dock panel instead of the viewport, and the panel's
 * `overflow-hidden` then clipped it: the list was taller than the box
 * containing it.
 *
 * The same applies to `filter`, `perspective`, `backdrop-filter` and
 * `will-change`, several of which this UI also uses — so escaping to the body
 * is the only reliable fix, not a workaround for one specific parent.
 */
export function ChatPortal({ children }: { children: ReactNode }) {
  // Portals need a DOM node, which does not exist during the server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
