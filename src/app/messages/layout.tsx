import type { Metadata } from "next";

// §7.3: every route segment carries a distinct <title>; the root layout
// supplies the "%s | SkooleeAI" template.
export const metadata: Metadata = {
  title: "Messages",
};

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
