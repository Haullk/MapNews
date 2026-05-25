import type { CSSProperties } from "react";

const NEGATIVE = "#dc2626";
const NEUTRAL = "#94a3b8";
const POSITIVE = "#2563eb";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixHexColor(fromColor: string, toColor: string, ratio: number) {
  const from = hexToRgb(fromColor);
  const to = hexToRgb(toColor);
  const amount = clamp(ratio, 0, 1);
  const channel = (fromValue: number, toValue: number) => Math.round(fromValue + (toValue - fromValue) * amount);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

export function attitudePosition(value: number | null) {
  if (value === null) return 50;
  return clamp(((value + 10) / 20) * 100, 0, 100);
}

export function attitudeColor(value: number | null) {
  if (value === null) return NEUTRAL;
  const normalized = clamp(value, -10, 10);
  if (normalized < 0) return mixHexColor(NEGATIVE, "#f8fafc", (normalized + 10) / 10);
  return mixHexColor("#f8fafc", POSITIVE, normalized / 10);
}

export function defaultAttitudeText(value: number | null) {
  if (value === null) return "中性/混合";
  if (value <= -4) return "冲突倾向强";
  if (value < -1) return "冲突倾向";
  if (value <= 1) return "中性/混合";
  if (value < 4) return "合作倾向";
  return "合作倾向强";
}

interface AttitudeIndicatorProps {
  value: number | null;
  valueText: string;
  toneText?: string;
  label?: string;
  compact?: boolean;
}

export function AttitudeIndicator({
  value,
  valueText,
  toneText = defaultAttitudeText(value),
  label = "态势倾向",
  compact = false,
}: AttitudeIndicatorProps) {
  return (
    <div
      className={`attitude-indicator ${compact ? "compact" : ""}`}
      style={{
        "--attitude-position": `${attitudePosition(value)}%`,
        "--attitude-color": attitudeColor(value),
      } as CSSProperties}
    >
      <div className="attitude-indicator-head">
        <span>{label}</span>
        <strong>
          {toneText} · {valueText}
        </strong>
      </div>
      <div className="attitude-track" aria-hidden="true">
        <i />
      </div>
      <div className="attitude-axis">
        <span>冲突倾向</span>
        <span>中性混合</span>
        <span>合作倾向</span>
      </div>
    </div>
  );
}
