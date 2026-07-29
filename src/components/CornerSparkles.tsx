"use client";

const sparkleKeyframes = `
@keyframes twinkle {
  0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
  25% { opacity: 1; transform: scale(1) rotate(45deg); }
  60% { opacity: 0.3; transform: scale(0.5) rotate(90deg); }
}
`;

export function CornerSparkles({ color = "#8127cf" }: { color?: string }) {
  const dots = [
    { t: "4px", l: "4px", d: 0 },
    { t: "4px", r: "4px", d: 0.6 },
    { b: "4px", l: "4px", d: 1.2 },
    { b: "4px", r: "4px", d: 1.8 },
    { t: "20px", l: "4px", d: 0.9 },
    { t: "4px", l: "20px", d: 0.3 },
    { t: "20px", r: "4px", d: 1.5 },
    { t: "4px", r: "20px", d: 2.1 },
    { b: "20px", l: "4px", d: 0.5 },
    { b: "4px", l: "20px", d: 1.1 },
    { b: "20px", r: "4px", d: 1.7 },
    { b: "4px", r: "20px", d: 2.3 },
  ];
  return (
    <>
      <style>{sparkleKeyframes}</style>
      {dots.map((p, i) => (
        <span
          key={i}
          className="absolute pointer-events-none z-10 flex items-center justify-center"
          style={{
            top: (p as any).t, left: (p as any).l, right: (p as any).r, bottom: (p as any).b,
            width: 12, height: 12,
            animation: `twinkle ${1.5 + (i % 3) * 0.5}s ease-in-out ${p.d}s infinite`,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 0L7.35 4.65L12 6L7.35 7.35L6 12L4.65 7.35L0 6L4.65 4.65Z" fill={color} />
            <path d="M6 2L6.9 5.1L10 6L6.9 6.9L6 10L5.1 6.9L2 6L5.1 5.1Z" fill="white" opacity="0.7" />
          </svg>
        </span>
      ))}
    </>
  );
}
