import { ParentRouteSkeleton } from "@/components/parent/parent-components";

// Rendered inside ParentShell, so only the page card is standing in.
export default function ParentLoading() {
  return <ParentRouteSkeleton />;
}
