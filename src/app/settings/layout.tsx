/** Redirect-only route (SPEC §6.3): the page sends each role to its own console view, so nothing renders here. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
