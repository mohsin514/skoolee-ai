// SKAI-1579: membership events are stored as English sentences ("X created this conversation", "X added
// A, B", "X left", "X removed Y"). This maps that stored shape back to a template the viewer's language can
// translate, with each name isolated (FSI…PDI) so RTL text does not reorder it. Unknown bodies pass through.
type Ui = (text: string, args?: Array<string | number>) => string;

const isolate = (name: string) => `⁨${name}⁩`;
const PATTERNS: Array<[RegExp, string]> = [
  [/^(.+) created this conversation$/, "{0} created this conversation"],
  [/^(.+) removed (.+)$/, "{0} removed {1}"],
  [/^(.+) added (.+)$/, "{0} added {1}"],
  // "{0} left" already means "{0} remaining" in the catalog, so the event uses its own key.
  [/^(.+) left$/, "{0} left the conversation"],
];
const FALLBACKS: Record<string, string> = { "A member": "A member", "A moderator": "A moderator", "a member": "a member" };

export function systemEventText(body: string, ui: Ui): string {
  for (const [pattern, template] of PATTERNS) {
    const match = pattern.exec(body);
    if (match) return ui(template, match.slice(1).map((name) => isolate(FALLBACKS[name] ? ui(name) : name)));
  }
  return body;
}
