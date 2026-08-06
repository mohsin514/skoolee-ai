import RoleAvatar from "./RoleAvatar";

/**
 * A RoleAvatar wrapped in a colourful gradient halo with a clean inner gap —
 * the "story ring" look, tinted per hue. Size comes from `className`
 * (e.g. "h-12 w-12"); the ring and gap scale from that.
 */
export default function AvatarBubble({
  hue,
  className = "h-12 w-12",
}: {
  hue: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full p-[2px] shadow-md shadow-black/20 ${className}`}
      style={{
        backgroundImage: `linear-gradient(140deg, hsl(${hue} 95% 70%), hsl(${(hue + 55) % 360} 92% 62%))`,
      }}
    >
      <span className="block h-full w-full overflow-hidden rounded-full border-2 border-white/90">
        <RoleAvatar hue={hue} />
      </span>
    </span>
  );
}
