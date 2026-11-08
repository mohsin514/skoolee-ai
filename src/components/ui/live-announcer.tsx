"use client";
import * as React from "react";

/**
 * One concise screen-reader announcement per real transition (run status,
 * result counts, scope change). Renders nothing visible. The region is cleared
 * first and filled on the next frame, so a repeated sentence after a different
 * one is still read. Use instead of aria-live around whole subtrees.
 */
export function LiveAnnouncer({ message, politeness = "polite" }: { message: string | null; politeness?: "polite" | "assertive" }) {
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    setText("");
    if (!message) return;
    const frame = window.requestAnimationFrame(() => setText(message));
    return () => window.cancelAnimationFrame(frame);
  }, [message]);
  return (
    <p role={politeness === "assertive" ? "alert" : "status"} aria-atomic="true" className="sr-only">
      {text}
    </p>
  );
}
