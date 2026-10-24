import { useId } from "react";
import { layoutById, noteName, pitchCompare } from "../lib/music";
import type { DrumKey, LayoutId, Tongue } from "../lib/types";

type Props = {
  layoutId: LayoutId;
  drumKey: DrumKey;
  active: Tongue | null;
};

function sector(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const point = (radius: number, angle: number) => [
    cx + radius * Math.cos(angle),
    cy + radius * Math.sin(angle),
  ];
  const [x0, y0] = point(outer, start);
  const [x1, y1] = point(outer, end);
  const [x2, y2] = point(inner, end);
  const [x3, y3] = point(inner, start);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function DrumDiagram({ layoutId, drumKey, active }: Props) {
  const rawId = useId().replace(/:/g, "");
  const layout = layoutById(layoutId);
  const tongues = [...layout.tongues].sort(pitchCompare);
  const count = tongues.length;
  const cx = 200;
  const cy = 200;
  const inner = 86;
  const outer = 176;
  const gap = Math.min(0.07, (Math.PI * 2) / count * 0.16);
  const sweep = (Math.PI * 2) / count;
  const labelRadius = count >= 13 ? 128 : 132;
  const nameOffset = count >= 13 ? 15 : 18;

  return (
    <svg className="drum-svg" viewBox="0 0 400 400" role="img" aria-hidden="true">
      <defs>
        <radialGradient id={`${rawId}-wood`} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#c9844a" />
          <stop offset="70%" stopColor="#8a4e28" />
          <stop offset="100%" stopColor="#5c3016" />
        </radialGradient>
        <radialGradient id={`${rawId}-steel`} cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#f7efe4" />
          <stop offset="100%" stopColor="#d9c4a6" />
        </radialGradient>
        <filter id={`${rawId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2.2" floodColor="#e2a322" floodOpacity="0.95" />
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r="190" fill={`url(#${rawId}-wood)`} />
      <circle cx={cx} cy={cy} r="180" fill="none" stroke="#3c2614" strokeOpacity="0.25" strokeWidth="2" />
      {tongues.map((tongue, index) => {
        const start = -Math.PI / 2 + index * sweep + gap / 2;
        const end = -Math.PI / 2 + (index + 1) * sweep - gap / 2;
        const mid = (start + end) / 2;
        const lit = active != null && active.deg === tongue.deg && active.oct === tongue.oct;
        const numberX = cx + labelRadius * Math.cos(mid);
        const numberY = cy + labelRadius * Math.sin(mid);
        const nameR = labelRadius + (tongue.oct < 0 ? nameOffset + 8 : nameOffset);
        const dotR = labelRadius + (tongue.oct > 0 ? -14 : 13);
        return (
          <g key={`${tongue.deg}:${tongue.oct}`}>
            <path
              d={sector(cx, cy, inner, outer, start, end)}
              fill={lit ? "#f6c445" : index % 2 === 0 ? "#f8efe3" : "#f1e2cd"}
              stroke={lit ? "#8a3b1c" : "#7a5332"}
              strokeWidth={lit ? 3 : 1.4}
              filter={lit ? `url(#${rawId}-glow)` : undefined}
            />
            {tongue.oct !== 0 ? (
              <circle cx={cx + dotR * Math.cos(mid)} cy={cy + dotR * Math.sin(mid)} r="2.5" fill="#3c2614" />
            ) : null}
            <text
              x={numberX}
              y={numberY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#3c2614"
              fontSize={count >= 13 ? 14 : 18}
              fontWeight={700}
              fontFamily="Fraunces, Georgia, serif"
            >
              {tongue.deg}
            </text>
            <text
              x={cx + nameR * Math.cos(mid)}
              y={cy + nameR * Math.sin(mid)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#5c4634"
              fontSize={count >= 13 ? 8 : 10}
              fontFamily="Atkinson Hyperlegible, Segoe UI, sans-serif"
            >
              {noteName(drumKey, tongue.deg, tongue.oct)}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={inner - 8} fill={`url(#${rawId}-steel)`} stroke="#7a5332" strokeWidth="2" />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fill="#3c2614"
        fontSize="42"
        fontWeight={700}
        fontFamily="Fraunces, Georgia, serif"
      >
        {drumKey}
      </text>
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        fill="#5c4634"
        fontSize="13"
        fontFamily="Atkinson Hyperlegible, Segoe UI, sans-serif"
      >
        {layout.noteCount} notes
      </text>
    </svg>
  );
}
