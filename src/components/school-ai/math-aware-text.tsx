import { mathSegments } from "@/lib/school-ai/math-direction";

/** Renders candidate text with each Latin-script expression isolated LTR (SKAI-1013). */
export function MathAwareText({ text }: { text: string }) {
  return <>{mathSegments(text).map((segment, index) => segment.math ? <bdi key={index} dir="ltr" className="whitespace-nowrap">{segment.text}</bdi> : segment.text)}</>;
}
