import type { RegionTrend } from "@/lib/hotspots";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function trendLinePath(
  points: RegionTrend["points"],
  valueForPoint: (point: RegionTrend["points"][number]) => number | null,
  minValue: number,
  maxValue: number,
) {
  if (points.length === 0) return "";
  const left = 8;
  const right = 292;
  const top = 10;
  const bottom = 66;
  const width = right - left;
  const height = bottom - top;
  const span = Math.max(1, maxValue - minValue);
  let drawing = false;
  const commands: string[] = [];
  points.forEach((point, index) => {
    const value = valueForPoint(point);
    if (value === null || !Number.isFinite(value)) {
      drawing = false;
      return;
    }
    const x = left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
    const y = bottom - clamp((value - minValue) / span, 0, 1) * height;
    commands.push(`${drawing ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    drawing = true;
  });
  return commands.join(" ");
}

function formatGoldstein(value: number | null) {
  if (value === null) return "暂无";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
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

function goldsteinColor(value: number | null) {
  if (value === null) return "#94a3b8";
  const normalized = clamp(value, -10, 10);
  if (normalized < 0) return mixHexColor("#dc2626", "#f8fafc", (normalized + 10) / 10);
  return mixHexColor("#f8fafc", "#2563eb", normalized / 10);
}

export function RegionTrendPanel({ trend, message }: { trend: RegionTrend | null; message: string | null }) {
  if (message && !trend) {
    return <div className="empty-detail">{message}</div>;
  }
  if (!trend || trend.points.length === 0) {
    return <div className="empty-detail">暂无可用趋势数据。</div>;
  }

  const availablePoints = trend.points.filter((point) => !point.isMissing);
  const maxHeat = Math.max(...trend.points.map((point) => point.heatScore), 1);
  const heatPath = trendLinePath(trend.points, (point) => point.heatScore, 0, maxHeat);
  const goldsteinPath = trendLinePath(trend.points, (point) => point.weightedGoldstein, -10, 10);
  const latestPoint = [...trend.points].reverse().find((point) => !point.isMissing);

  return (
    <div className="trend-panel">
      <div className="trend-panel-heading">
        <span>近 {trend.days} 天</span>
        <strong>{availablePoints.length}/{trend.points.length} 天有数据</strong>
      </div>
      <div className="trend-chart">
        <div className="trend-chart-title">
          <span>热度趋势</span>
          <strong>{latestPoint ? latestPoint.heatScore.toFixed(1) : "暂无"}</strong>
        </div>
        <svg viewBox="0 0 300 76" role="img" aria-label={`${trend.regionName} 热度趋势`}>
          <line className="trend-axis" x1="8" y1="66" x2="292" y2="66" />
          <path className="trend-line heat" d={heatPath} />
        </svg>
      </div>
      <div className="trend-chart">
        <div className="trend-chart-title">
          <span>态势趋势</span>
          <strong>{latestPoint ? formatGoldstein(latestPoint.weightedGoldstein) : "暂无"}</strong>
        </div>
        <svg viewBox="0 0 300 76" role="img" aria-label={`${trend.regionName} 态势趋势`}>
          <line className="trend-axis" x1="8" y1="38" x2="292" y2="38" />
          <path className="trend-line goldstein" d={goldsteinPath} />
          {trend.points.map((point, index) => {
            if (point.weightedGoldstein === null) return null;
            const x = 8 + (trend.points.length === 1 ? 142 : (index / (trend.points.length - 1)) * 284);
            const y = 66 - clamp((point.weightedGoldstein + 10) / 20, 0, 1) * 56;
            return (
              <circle
                key={point.dataDate}
                cx={x}
                cy={y}
                r={2.4}
                fill={goldsteinColor(point.weightedGoldstein)}
              />
            );
          })}
        </svg>
      </div>
      <div className="trend-meta">
        <span>{trend.startDate ?? "暂无"} 至 {trend.endDate ?? "暂无"}</span>
        <span>缺失日期按 0 热度展示</span>
      </div>
    </div>
  );
}
