import { Fragment, type ReactNode } from "react";

/**
 * Fills a translated `{0}` template with React nodes, each isolated in a
 * `<bdi>`, so a Latin name or file name inside an Arabic or Urdu sentence keeps
 * its own direction. Pass the template already translated — `fill(ui("Seen {0}"), [time])`
 * — so the coverage test still sees the literal key.
 */
export function fill(template: string, values: ReactNode[]): ReactNode {
  return template.split(/(\{\d+\})/).map((part, index) => {
    const match = /^\{(\d+)\}$/.exec(part);
    if (!match) return <Fragment key={index}>{part}</Fragment>;
    const value = values[Number(match[1])];
    return value === undefined ? <Fragment key={index}>{part}</Fragment> : <bdi key={index}>{value}</bdi>;
  });
}
