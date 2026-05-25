import type { CSSProperties } from "react";
import type { MapHotspot } from "@/lib/hotspots";

export type ResultSortMode = "heat" | "attitude";

interface RankingListProps {
  items: MapHotspot[];
  maxHeat: number;
  loading: boolean;
  sortMode: ResultSortMode;
  selectedRegionKey: string | null;
  selectedDataDate: string | null;
  onSortChange: (mode: ResultSortMode) => void;
  onLocate: (item: MapHotspot) => void;
  attitudeColor: (value: number | null) => string;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
}

function formatHeatScore(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("zh-CN");
}

function trendBadgeClass(trendLabel: string) {
  if (trendLabel === "显著升温" || trendLabel === "升温") return "warming";
  if (trendLabel === "冷却") return "cooling";
  if (trendLabel === "平稳" || trendLabel === "活跃") return "active";
  return "neutral";
}

export function RankingList({
  items,
  maxHeat,
  loading,
  sortMode,
  selectedRegionKey,
  selectedDataDate,
  onSortChange,
  onLocate,
  attitudeColor,
  formatGoldstein,
  themeLabel,
}: RankingListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading ranking-heading">
        <p className="eyebrow">结果列表</p>
        <label className="ranking-sort">
          <span>{loading && items.length > 0 ? "正在更新" : "排序方式"}</span>
          <select
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value as ResultSortMode)}
            aria-label="结果排序"
          >
            <option value="heat">报道热度</option>
            <option value="attitude">态势值</option>
          </select>
        </label>
      </div>
      <div className="ranking-list">
        {loading && items.length === 0 ? (
          <div className="ranking-skeleton" aria-label="结果列表加载中">
            {Array.from({ length: 8 }).map((_, index) => (
              <i key={index} />
            ))}
          </div>
        ) : null}
        {items.map((item, index) => {
          const selected = item.regionKey === selectedRegionKey && item.dataDate === selectedDataDate;
          const color = attitudeColor(item.weightedGoldstein);
          return (
            <button
              key={item.id}
              type="button"
              className={`ranking-item ${selected ? "selected" : ""}`}
              style={{ "--topic-color": color } as CSSProperties}
              aria-current={selected ? "true" : undefined}
              onClick={() => onLocate(item)}
            >
              <span className="ranking-index">{index + 1}</span>
              <span className="ranking-title">{item.regionName}</span>
              <span className="ranking-meta">
                <span className="meta-topic">{themeLabel(item.channel)}</span>
                <span className={`trend-badge ${trendBadgeClass(item.trendLabel)}`}>{item.trendLabel}</span>
                <strong className="attitude-value">态势 {formatGoldstein(item.weightedGoldstein)}</strong>
              </span>
              <span className="ranking-heat-text">报道热度 {formatHeatScore(item.heatScore)}</span>
              <i className="heat-bar">
                <b style={{ width: `${Math.max(8, Math.round((item.heatScore / maxHeat) * 100))}%` }} />
              </i>
            </button>
          );
        })}
        {!loading && items.length === 0 ? <div className="empty-detail">当前筛选下暂无结果。</div> : null}
      </div>
    </div>
  );
}
