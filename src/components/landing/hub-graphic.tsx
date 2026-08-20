import { LogoMark } from "@/components/logo";

// Purely decorative: abstract orbiting nodes converging on the brand mark,
// standing in for "many tools, one entry point" without naming or
// describing any actual module — the landing page shouldn't reveal what's
// behind the login before someone signs in.
const NODES = [
  { cx: 120, cy: 95, r: 22, opacity: 0.5, delay: "0s", duration: "7s" },
  { cx: 250, cy: 40, r: 14, opacity: 0.35, delay: "0.6s", duration: "6s" },
  { cx: 660, cy: 65, r: 24, opacity: 0.45, delay: "0.3s", duration: "8s" },
  { cx: 730, cy: 165, r: 15, opacity: 0.3, delay: "0.9s", duration: "6.5s" },
  { cx: 170, cy: 195, r: 16, opacity: 0.3, delay: "1.2s", duration: "7.5s" },
  { cx: 600, cy: 205, r: 19, opacity: 0.4, delay: "0.15s", duration: "6.8s" },
];

const CENTER = { cx: 400, cy: 130 };

export function HubGraphic() {
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto mt-2 max-w-3xl px-6 sm:mt-4">
      <svg viewBox="0 0 800 260" className="block w-full" fill="none">
        {NODES.map((n, i) => (
          <line
            key={`line-${i}`}
            x1={CENTER.cx}
            y1={CENTER.cy}
            x2={n.cx}
            y2={n.cy}
            stroke="var(--border-strong)"
            strokeWidth="1"
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={`node-${i}`}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="var(--primary)"
            opacity={n.opacity}
            className="animate-float"
            style={{ animationDelay: n.delay, animationDuration: n.duration }}
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-surface text-primary-strong shadow-md sm:h-20 sm:w-20">
          <LogoMark className="h-8 w-8 sm:h-10 sm:w-10" />
        </span>
      </div>
    </div>
  );
}
