"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type Tag = "span" | "p" | "h3" | "h4";

/**
 * Long names, codes and titles truncate to one or two lines. Only when the text
 * really overflows does it become focusable and show the full value in the
 * shared Tooltip (never `title=`). `dir="auto"` keeps mixed-script text right.
 */
export function TruncatedText({ text, lines = 1, as = "span", className }: { text: string; lines?: 1 | 2; as?: Tag; className?: string }) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, lines]);

  const element = React.createElement(as, {
    ref,
    dir: "auto",
    tabIndex: overflowing ? 0 : undefined,
    className: cn("block min-w-0", lines === 1 ? "truncate" : "line-clamp-2 [overflow-wrap:anywhere]", overflowing && "rounded-sm", className),
  }, text);

  return overflowing ? <Tooltip content={text}>{element}</Tooltip> : element;
}
