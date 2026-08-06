/**
 * A friendly, original person avatar drawn as pure SVG — no photos.
 * Soft gradient bubble + face, rosy cheeks and big highlighted eyes that nod
 * to the Skoolee wordmark. `hue` recolours the whole thing, so a set reads as
 * a cheerful, diverse cluster of users (admins, teachers, parents, students).
 *
 * Ported from the marketing site's StudentAvatar so the auth screens share
 * the same character design language as skoolee-ai-marketing.
 */
export default function RoleAvatar({
  hue = 265,
  className = "h-full w-full",
}: {
  hue?: number;
  className?: string;
}) {
  const bub = `ra-bub-${hue}`;
  const face = `ra-face-${hue}`;
  const shine = `ra-shine-${hue}`;

  const skin = `hsl(${hue} 60% 79%)`;
  const skinDeep = `hsl(${hue} 52% 67%)`;
  const hair = `hsl(${hue} 45% 28%)`;
  const shirt = `hsl(${hue} 74% 57%)`;
  const shirtDeep = `hsl(${hue} 70% 48%)`;
  const cheek = `hsl(${hue} 88% 76%)`;
  const bubbleA = `hsl(${hue} 92% 96%)`;
  const bubbleB = `hsl(${hue} 80% 87%)`;

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={bub} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bubbleA} />
          <stop offset="1" stopColor={bubbleB} />
        </linearGradient>
        <linearGradient id={face} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skin} />
          <stop offset="1" stopColor={skinDeep} />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shirt} />
          <stop offset="1" stopColor={shirtDeep} />
        </linearGradient>
      </defs>

      <rect width="64" height="64" fill={`url(#${bub})`} />

      <path d="M13 63c0-10.5 8.5-16.5 19-16.5S51 52.5 51 63z" fill={`url(#${shine})`} />
      <path d="M26.5 47.5h11v6.5l-5.5 4.5-5.5-4.5z" fill="#fff" opacity="0.95" />
      <path d="M32 48.5l2.4 3-2.4 2.6-2.4-2.6z" fill={shirtDeep} opacity="0.5" />

      <circle cx="32" cy="31.5" r="15" fill={`url(#${face})`} />

      <path d="M18 26c-.6 3.6.3 6.8 2.4 9 .4-3.4.2-6.8-2.4-9z" fill={hair} />
      <path d="M46 26c.6 3.6-.3 6.8-2.4 9-.4-3.4-.2-6.8 2.4-9z" fill={hair} />
      <path d="M18.5 22a13.5 10 0 0 1 27 0z" fill={hair} />

      <ellipse cx="23.5" cy="36" rx="3" ry="2.3" fill={cheek} opacity="0.7" />
      <ellipse cx="40.5" cy="36" rx="3" ry="2.3" fill={cheek} opacity="0.7" />

      <circle cx="26.2" cy="31" r="3.3" fill="#241a2e" />
      <circle cx="37.8" cy="31" r="3.3" fill="#241a2e" />
      <circle cx="27.5" cy="29.6" r="1.15" fill="#fff" />
      <circle cx="39.1" cy="29.6" r="1.15" fill="#fff" />

      <path d="M26.5 38c1.9 2.8 9.1 2.8 11 0" fill="none" stroke="#241a2e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
