"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The step card's action row. It sticks to the bottom of the viewport while
 * the card runs past the fold, so the step's one plum action is always in
 * reach, and picks up a lifted edge only while it is actually floating (a 1px
 * sentinel below it is out of view). On coarse pointers it returns to the
 * flow while a text field has focus (CSS), so it never rides the keyboard.
 *
 * Phones: an `extra` action (e.g. "Compare packages") takes a full-width row
 * on top; Back and the primary share the row below.
 */
export type StepDockProps = {
  back?: { label: string; onClick(): void; disabled?: boolean };
  extra?: ReactNode;
  primary: ReactNode;                       // the step's one plum Button (the caller owns its exact name)
  reason?: { id: string; text: string };    // disabled reason, linked by the caller via aria-describedby
};

export function StepDock({ back, extra, primary, reason }: StepDockProps) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      const below = !entry.isIntersecting && entry.rootBounds !== null && entry.boundingClientRect.top > entry.rootBounds.bottom;
      setStuck(below);
    }, { rootMargin: "0px 0px -12px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="sk-step-dock" data-stuck={stuck ? "true" : undefined} data-solo={back ? undefined : ""}>
        <div data-dock="start">
          {back ? (
            <Button variant="outline" type="button" onClick={back.onClick} disabled={back.disabled} className="gap-2">
              <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
              {back.label}
            </Button>
          ) : <span />}
        </div>
        <div data-dock="end">
          {extra ? <div data-dock="extra">{extra}</div> : null}
          <div data-dock="primary">
            {primary}
            {reason ? <p id={reason.id} className="text-xs leading-snug text-ink-subtle">{reason.text}</p> : null}
          </div>
        </div>
      </div>
      <div ref={sentinel} aria-hidden="true" className="sk-step-dock-sentinel" />
    </>
  );
}
