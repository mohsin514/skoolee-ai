import type { ReactNode } from "react";

// Provider text stays React text. Support common answer formatting without
// interpreting HTML or turning model-supplied links into actions.
function inlineText(value: string): ReactNode[] {
  return value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function AssistantResponse({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { blocks.push(<h3 key={index} className="font-bold">{inlineText(heading[1])}</h3>); continue; }
    const bullet = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      const ordered = /^\s*\d/.test(line);
      const items = [<li key={index}>{inlineText(bullet[1])}</li>];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
        if (!next) break;
        index++;
        items.push(<li key={index}>{inlineText(next[1])}</li>);
      }
      blocks.push(ordered ? <ol key={`list-${index}`} className="list-decimal space-y-1 ps-5">{items}</ol> : <ul key={`list-${index}`} className="list-disc space-y-1 ps-5">{items}</ul>);
      continue;
    }
    blocks.push(<p key={index}>{inlineText(line)}</p>);
  }
  return <div className="space-y-2 whitespace-normal break-words">{blocks}</div>;
}
