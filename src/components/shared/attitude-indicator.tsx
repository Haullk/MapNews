import type { CSSProperties } from "react";

const NEGATIVE = "#dc2626";
const NEUTRAL = "#f8fafc";
const POSITIVE = "#2563eb";
const MISSING = "#94a3b8";
const FIXED_GOLDSTEIN_MIN = -10;
const FIXED_GOLDSTEIN_MAX = 10;
const MIN_DYNAMIC_SIDE_SPAN = 1.5;

export interface GoldsteinColorScale {
  min: number;
  max: number;
  isDynamic: boolean;
}

export const FIXED_GOLDSTEIN_COLOR_SCALE: GoldsteinColorScale = {
  min: FIXED_GOLDSTEIN_MIN,
  max: FIXED_GOLDSTEIN_MAX,
  isDynamic: false,
};

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

function quantile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const position = (values.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower] ?? 0;
  const weight = position - lower;
  return (values[lower] ?? 0) * (1 - weight) + (values[upper] ?? 0) * weight;
}

export function buildGoldsteinColorScale(values: Array<number | null | undefined>): GoldsteinColorScale {
  const finiteValues = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (finiteValues.length < 4) return FIXED_GOLDSTEIN_COLOR_SCALE;

  const p5 = quantile(finiteValues, 0.05);
  const p95 = quantile(finiteValues, 0.95);
  if (!Number.isFinite(p5) || !Number.isFinite(p95) || p5 === p95) return FIXED_GOLDSTEIN_COLOR_SCALE;

  let min = Math.min(p5, 0);
  let max = Math.max(p95, 0);
  const hasNegativeValue = (finiteValues[0] ?? 0) < 0;
  const hasPositiveValue = (finiteValues[finiteValues.length - 1] ?? 0) > 0;

  if (hasNegativeValue && min === 0) min = Math.max(finiteValues[0] ?? -MIN_DYNAMIC_SIDE_SPAN, -MIN_DYNAMIC_SIDE_SPAN);
  if (hasPositiveValue && max === 0) max = Math.min(finiteValues[finiteValues.length - 1] ?? MIN_DYNAMIC_SIDE_SPAN, MIN_DYNAMIC_SIDE_SPAN);
  if (min < 0 && Math.abs(min) < MIN_DYNAMIC_SIDE_SPAN) min = -MIN_DYNAMIC_SIDE_SPAN;
  if (max > 0 && max < MIN_DYNAMIC_SIDE_SPAN) max = MIN_DYNAMIC_SIDE_SPAN;

  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return FIXED_GOLDSTEIN_COLOR_SCALE;
  return { min, max, isDynamic: true };
}

export function goldsteinPosition(value: number | null, scale: GoldsteinColorScale = FIXED_GOLDSTEIN_COLOR_SCALE) {
  if (value === null) return 50;
  return clamp(((value - scale.min) / Math.max(scale.max - scale.min, 1)) * 100, 0, 100);
}

export function goldsteinColor(value: number | null, scale: GoldsteinColorScale = FIXED_GOLDSTEIN_COLOR_SCALE) {
  if (value === null) return MISSING;
  if (value < 0) {
    if (scale.min >= 0) return NEGATIVE;
    const normalized = clamp(value, scale.min, 0);
    return mixHexColor(NEGATIVE, NEUTRAL, (normalized - scale.min) / Math.abs(scale.min));
  }
  if (scale.max <= 0) return POSITIVE;
  const normalized = clamp(value, 0, scale.max);
  return mixHexColor(NEUTRAL, POSITIVE, normalized / scale.max);
}

export function goldsteinLegendGradient(scale: GoldsteinColorScale = FIXED_GOLDSTEIN_COLOR_SCALE) {
  const neutralPosition = goldsteinPosition(0, scale);
  const leftColor = scale.min < 0 ? NEGATIVE : NEUTRAL;
  const rightColor = scale.max > 0 ? POSITIVE : NEUTRAL;
  return `linear-gradient(90deg, ${leftColor} 0%, ${NEUTRAL} ${neutralPosition}%, ${rightColor} 100%)`;
}

export function attitudePosition(value: number | null) {
  return goldsteinPosition(value);
}

export function attitudeColor(value: number | null) {
  return goldsteinColor(value);
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
  colorScale?: GoldsteinColorScale;
}

export function AttitudeIndicator({
  value,
  valueText,
  toneText = defaultAttitudeText(value),
  label = "态势倾向",
  compact = false,
  colorScale = FIXED_GOLDSTEIN_COLOR_SCALE,
}: AttitudeIndicatorProps) {
  return (
    <div
      className={`attitude-indicator ${compact ? "compact" : ""}`}
      style={{
        "--attitude-position": `${goldsteinPosition(value, colorScale)}%`,
        "--attitude-color": goldsteinColor(value, colorScale),
        "--attitude-track-bg": goldsteinLegendGradient(colorScale),
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
