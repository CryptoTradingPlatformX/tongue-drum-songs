import { useId } from "react";
import { DRUM_15_CENTER, DRUM_15_OUTER, type Drum15Outer } from "../lib/drum15";
import { noteName } from "../lib/music";
import type { DrumKey, Tongue } from "../lib/types";

type Props = {
  drumKey: DrumKey;
  active: Tongue | null;
};

const CX = 200;
const CY = 200;

function radial(deg: number, radius: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

function offset(deg: number, radius: number, side: -1 | 1, halfW: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const ox = Math.sin(rad);
  const oy = -Math.cos(rad);
  const tx = Math.cos(rad);
  const ty = Math.sin(rad);
  return [CX + radius * ox + side * halfW * tx, CY + radius * oy + side * halfW * ty];
}

/** How far a long tongue can reach before it meets the center tongue. */
function longTip(deg: number): number {
  const rad = (deg * Math.PI) / 180;
  const sx = Math.sin(rad);
  const cy = Math.cos(rad);
  const rx = 30;
  const ry = 62;
  const t = 1 / Math.sqrt((sx * sx) / (rx * rx) + (cy * cy) / (ry * ry));
  return t + 16;
}

function tongueGeometry(tongue: Drum15Outer): { outerR: number; halfW: number; tip: number } {
  if (tongue.size === "short") return { outerR: 158, halfW: 11, tip: 112 };
  return { outerR: 158, halfW: 18.5, tip: longTip(tongue.angle) };
}

function slotPath(deg: number, outerR: number, tip: number, halfW: number, close: boolean): string {
  const arcR = tip + halfW;
  const [olx, oly] = offset(deg, outerR, -1, halfW);
  const [orx, ory] = offset(deg, outerR, 1, halfW);
  const [ilx, ily] = offset(deg, arcR, -1, halfW);
  const [irx, iry] = offset(deg, arcR, 1, halfW);
  const [acx, acy] = radial(deg, arcR);
  const [tx, ty] = radial(deg, tip);
  // Positive cross product is clockwise in SVG, so the cap bends toward the center.
  const cross = (ilx - acx) * (ty - acy) - (ily - acy) * (tx - acx);
  const sweep = cross > 0 ? 1 : 0;
  const cap = `A ${halfW} ${halfW} 0 0 ${sweep} ${tx} ${ty} A ${halfW} ${halfW} 0 0 ${sweep} ${irx} ${iry}`;
  const body = `M ${olx} ${oly} L ${ilx} ${ily} ${cap} L ${orx} ${ory}`;
  if (!close) return body;
  return `${body} A ${outerR} ${outerR} 0 0 ${sweep === 1 ? 0 : 1} ${olx} ${oly} Z`;
}

function isLit(active: Tongue | null, tongue: Tongue): boolean {
  return active != null && active.deg === tongue.deg && active.oct === tongue.oct;
}

export function Drum15Diagram({ drumKey, active }: Props) {
  const rawId = useId().replace(/:/g, "");
  const steel = `${rawId}-steel`;
  const glow = `${rawId}-glow`;

  return (
    <svg className="drum-svg drum-15" viewBox="0 0 400 400" role="img" aria-hidden="true">
      <defs>
        <radialGradient id={steel} cx="46%" cy="40%" r="68%">
          <stop offset="0%" stopColor="#7eafd4" />
          <stop offset="55%" stopColor="#3f78aa" />
          <stop offset="100%" stopColor="#2c5d8c" />
        </radialGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#f6c445" floodOpacity="0.95" />
        </filter>
      </defs>

      <circle cx={CX} cy={CY} r="194" fill="#c9b08a" />
      <circle cx={CX} cy={CY} r="184" fill="#e4d2b4" />
      <circle cx={CX} cy={CY} r="176" fill="#a8845c" />
      <circle cx={CX} cy={CY} r="168" fill={`url(#${steel})`} stroke="#1d3348" strokeWidth="2.5" />

      {DRUM_15_OUTER.map((tongue) => {
        const geo = tongueGeometry(tongue);
        const lit = isLit(active, tongue);
        return (
          <path
            key={`fill-${tongue.deg}:${tongue.oct}`}
            d={slotPath(tongue.angle, geo.outerR, geo.tip, geo.halfW, true)}
            fill={lit ? "#f6c445" : "none"}
            stroke="none"
            filter={lit ? `url(#${glow})` : undefined}
          />
        );
      })}
      <CenterTongue lit={isLit(active, DRUM_15_CENTER)} glow={`url(#${glow})`} />

      {DRUM_15_OUTER.map((tongue) => {
        const geo = tongueGeometry(tongue);
        const lit = isLit(active, tongue);
        return (
          <path
            key={`slot-${tongue.deg}:${tongue.oct}`}
            d={slotPath(tongue.angle, geo.outerR, geo.tip, geo.halfW, false)}
            fill="none"
            stroke={lit ? "#8a3b1c" : "#14283a"}
            strokeWidth={lit ? 3 : 2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {DRUM_15_OUTER.map((tongue) => (
        <TongueLabel key={`label-${tongue.deg}:${tongue.oct}`} tongue={tongue} drumKey={drumKey} lit={isLit(active, tongue)} />
      ))}
      <CenterLabel drumKey={drumKey} lit={isLit(active, DRUM_15_CENTER)} />
    </svg>
  );
}

function CenterTongue({ lit, glow }: { lit: boolean; glow: string }) {
  return (
    <rect
      x={CX - 26}
      y={CY - 58}
      width={52}
      height={116}
      rx={26}
      fill={lit ? "#f6c445" : "none"}
      stroke={lit ? "#8a3b1c" : "#14283a"}
      strokeWidth={lit ? 3 : 2.4}
      filter={lit ? glow : undefined}
    />
  );
}

function TongueLabel({ tongue, drumKey, lit }: { tongue: Drum15Outer; drumKey: DrumKey; lit: boolean }) {
  const name = noteName(drumKey, tongue.deg, tongue.oct);
  const numR = 146;
  const [nx, ny] = radial(tongue.angle, numR);
  const dotR = tongue.oct > 0 ? numR + 13 : numR - 14;
  const [dx, dy] = radial(tongue.angle, dotR);
  const [lx, ly] = radial(tongue.angle, tongue.oct < 0 ? numR - 28 : numR - 16);
  const ink = lit ? "#3c2614" : "#f7fbff";
  const soft = lit ? "#5c4634" : "#e4f0fa";
  return (
    <g>
      <title>{`${tongue.deg} ${name}`}</title>
      {tongue.oct !== 0 ? <circle cx={dx} cy={dy} r="2.6" fill={ink} /> : null}
      <text
        x={nx}
        y={ny}
        fill={ink}
        fontSize="16"
        fontWeight={700}
        fontFamily="Fraunces, Georgia, serif"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${tongue.angle} ${nx} ${ny})`}
      >
        {tongue.deg}
      </text>
      <text
        x={lx}
        y={ly}
        fill={soft}
        fontSize="8"
        fontFamily="Atkinson Hyperlegible, Segoe UI, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${tongue.angle} ${lx} ${ly})`}
      >
        {name}
      </text>
    </g>
  );
}

function CenterLabel({ drumKey, lit }: { drumKey: DrumKey; lit: boolean }) {
  const name = noteName(drumKey, DRUM_15_CENTER.deg, DRUM_15_CENTER.oct);
  const ink = lit ? "#3c2614" : "#f7fbff";
  const soft = lit ? "#5c4634" : "#e4f0fa";
  return (
    <g>
      <title>{`3 ${name}`}</title>
      <text
        x={CX}
        y={CY - 24}
        fill={ink}
        fontSize="20"
        fontWeight={700}
        fontFamily="Fraunces, Georgia, serif"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        3
      </text>
      <circle cx={CX} cy={CY - 8} r="2.7" fill={ink} />
      <text
        x={CX}
        y={CY + 10}
        fill={soft}
        fontSize="9"
        fontFamily="Atkinson Hyperlegible, Segoe UI, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {name}
      </text>
    </g>
  );
}
