import { useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import type { HotspotChannelBreakdown } from "@/lib/hotspots";

interface ThemeDonutChartProps {
  items: HotspotChannelBreakdown[];
  totalHeat: number;
  selectedHotspotId: number | null;
  channelColors: Record<string, string>;
  themeLabel: (channel: string) => string;
  onSelectTheme: (hotspotId: number) => void;
}

interface DonutSegment {
  item: HotspotChannelBreakdown;
  color: string;
  percent: number;
  path: string;
  hitPath: string;
  hitStartAngle: number;
  hitEndAngle: number;
}

const CENTER = 110;
const RADIUS = 72;
const STROKE_WIDTH = 24;
const HIT_STROKE_WIDTH = 42;
const GAP_DEGREES = 1.3;
const MIN_HIT_DEGREES = 9;

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function arcPath(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const sweep = Math.max(0, endAngle - startAngle);
  if (sweep >= 359.9) {
    const top = polarToCartesian(centerX, centerY, radius, 0);
    const bottom = polarToCartesian(centerX, centerY, radius, 180);
    return [
      `M ${top.x.toFixed(3)} ${top.y.toFixed(3)}`,
      `A ${radius} ${radius} 0 1 1 ${bottom.x.toFixed(3)} ${bottom.y.toFixed(3)}`,
      `A ${radius} ${radius} 0 1 1 ${top.x.toFixed(3)} ${top.y.toFixed(3)}`,
    ].join(" ");
  }

  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = sweep <= 180 ? "0" : "1";

  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(" ");
}

function sectorPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = Math.max(0, endAngle - startAngle);
  if (sweep >= 359.9) {
    const outerTop = polarToCartesian(centerX, centerY, outerRadius, 0);
    const outerBottom = polarToCartesian(centerX, centerY, outerRadius, 180);
    const innerTop = polarToCartesian(centerX, centerY, innerRadius, 0);
    const innerBottom = polarToCartesian(centerX, centerY, innerRadius, 180);
    return [
      `M ${outerTop.x.toFixed(3)} ${outerTop.y.toFixed(3)}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerBottom.x.toFixed(3)} ${outerBottom.y.toFixed(3)}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerTop.x.toFixed(3)} ${outerTop.y.toFixed(3)}`,
      `M ${innerTop.x.toFixed(3)} ${innerTop.y.toFixed(3)}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerBottom.x.toFixed(3)} ${innerBottom.y.toFixed(3)}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerTop.x.toFixed(3)} ${innerTop.y.toFixed(3)}`,
      "Z",
    ].join(" ");
  }

  const outerStart = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const largeArcFlag = sweep <= 180 ? "0" : "1";

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function percentLabel(percent: number) {
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function buildSegments(
  items: HotspotChannelBreakdown[],
  totalHeat: number,
  channelColors: Record<string, string>,
) {
  const denominator = Math.max(totalHeat, 1);
  let cursor = 0;

  return items.map((item) => {
    const rawSweep = Math.max(0, (item.heatScore / denominator) * 360);
    const visualGap = items.length > 1 ? Math.min(GAP_DEGREES, rawSweep * 0.35) : 0;
    const startAngle = cursor + visualGap / 2;
    const endAngle = Math.max(startAngle + 0.2, cursor + rawSweep - visualGap / 2);
    const midpoint = cursor + rawSweep / 2;
    const hitSweep = Math.max(rawSweep, MIN_HIT_DEGREES);
    const hitStart = Math.max(0, midpoint - hitSweep / 2);
    const hitEnd = Math.min(360, midpoint + hitSweep / 2);
    cursor += rawSweep;

    return {
      item,
      color: channelColors[item.channel] ?? "#0f8f7f",
      percent: (item.heatScore / denominator) * 100,
      path: arcPath(CENTER, CENTER, RADIUS, startAngle, endAngle),
      hitPath: sectorPath(
        CENTER,
        CENTER,
        RADIUS - HIT_STROKE_WIDTH / 2,
        RADIUS + HIT_STROKE_WIDTH / 2,
        hitStart,
        hitEnd,
      ),
      hitStartAngle: hitStart,
      hitEndAngle: hitEnd,
    };
  });
}

export function ThemeDonutChart({
  items,
  totalHeat,
  selectedHotspotId,
  channelColors,
  themeLabel,
  onSelectTheme,
}: ThemeDonutChartProps) {
  const [focusedHotspotId, setFocusedHotspotId] = useState<number | null>(null);
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => right.heatScore - left.heatScore),
    [items],
  );
  const segments = useMemo(
    () => buildSegments(sortedItems, totalHeat, channelColors),
    [channelColors, sortedItems, totalHeat],
  );
  const activeItem =
    sortedItems.find((item) => item.hotspotId === focusedHotspotId) ??
    sortedItems.find((item) => item.hotspotId === selectedHotspotId) ??
    sortedItems[0] ??
    null;
  const activeSegment = activeItem
    ? segments.find((segment) => segment.item.hotspotId === activeItem.hotspotId)
    : null;

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, hotspotId: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectTheme(hotspotId);
    }
  }

  function handleSvgClick(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 220;
    const y = ((event.clientY - rect.top) / rect.height) * 220;
    const deltaX = x - CENTER;
    const deltaY = y - CENTER;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const innerRadius = RADIUS - HIT_STROKE_WIDTH / 2;
    const outerRadius = RADIUS + HIT_STROKE_WIDTH / 2;
    if (distance < innerRadius || distance > outerRadius) return;

    const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    const normalizedAngle = (angle + 90 + 360) % 360;
    const segment = segments.find(
      (item) => normalizedAngle >= item.hitStartAngle && normalizedAngle <= item.hitEndAngle,
    );
    if (segment) onSelectTheme(segment.item.hotspotId);
  }

  if (!sortedItems.length || !activeItem) {
    return <div className="empty-detail">暂无话题占比数据。</div>;
  }

  return (
    <div className="theme-donut-card">
      <div className="theme-donut-chart" onMouseLeave={() => setFocusedHotspotId(null)}>
        <svg
          className="theme-donut-svg"
          viewBox="0 0 220 220"
          aria-label="话题热度占比圆环图"
          onClick={handleSvgClick}
        >
          <circle className="theme-donut-track" cx={CENTER} cy={CENTER} r={RADIUS} />
          {segments.map((segment) => {
            const active =
              segment.item.hotspotId === focusedHotspotId ||
              segment.item.hotspotId === selectedHotspotId;
            const label = `${themeLabel(segment.item.channel)}，约 ${percentLabel(segment.percent)} 热度，${segment.item.eventCount} 个事件，${segment.item.sourceCount} 个来源，点击查看相关新闻`;
            return (
              <g
                key={segment.item.hotspotId}
                role="button"
                tabIndex={0}
                focusable="true"
                aria-label={label}
                className={`theme-donut-segment ${active ? "active" : ""}`}
                onMouseEnter={() => setFocusedHotspotId(segment.item.hotspotId)}
                onFocus={() => setFocusedHotspotId(segment.item.hotspotId)}
                onBlur={() => setFocusedHotspotId(null)}
                onKeyDown={(event) => handleKeyDown(event, segment.item.hotspotId)}
                style={{ "--segment-color": segment.color } as CSSProperties}
              >
                <path className="theme-donut-visible" d={segment.path} />
                <path className="theme-donut-hit" d={segment.hitPath} fillRule="evenodd" />
              </g>
            );
          })}
        </svg>
        <div className="theme-donut-center" style={{ "--segment-color": activeSegment?.color ?? "#0f8f7f" } as CSSProperties}>
          <span>{themeLabel(activeItem.channel)}</span>
          <strong>{percentLabel((activeItem.heatScore / Math.max(totalHeat, 1)) * 100)}</strong>
          <small>{activeItem.sourceCount} 个来源 · {activeItem.eventCount} 个事件</small>
        </div>
      </div>
      <p className="theme-donut-hint">悬停查看话题，点击色块查看相关新闻。</p>
    </div>
  );
}
