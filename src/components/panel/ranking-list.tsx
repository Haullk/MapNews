import type { CSSProperties } from "react";
import type { MapHotspot } from "@/lib/hotspots";

export type ResultSortMode = "heat" | "attitude";

interface RankingListProps {
  items: MapHotspot[];
  maxHeat: number;
  sortMode: ResultSortMode;
  onSortModeChange: (mode: ResultSortMode) => void;
  selectedRegionKey: string | null;
  selectedDataDate: string | null;
  onLocate: (item: MapHotspot) => void;
  channelColors: Record<string, string>;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
}

function formatHeatScore(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("zh-CN");
}

export function RankingList({
  items,
  maxHeat,
  sortMode,
  onSortModeChange,
  selectedRegionKey,
  selectedDataDate,
  onLocate,
  channelColors,
  formatGoldstein,
  themeLabel,
}: RankingListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading ranking-heading">
        <p className="eyebrow">结果列表</p>
        <label className="sort-control">
          <span>排序</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as ResultSortMode)}
            aria-label="结果列表排序"
          >
            <option value="heat">综合热度</option>
            <option value="attitude">态势值</option>
          </select>
        </label>
      </div>
      <div className="ranking-list">
        {items.map((item, index) => {
          const selected = item.regionKey === selectedRegionKey && item.dataDate === selectedDataDate;
          const color = channelColors[item.channel] ?? "#0f8f7f";
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
              <strong className="ranking-meta">
                <i className="situation-dot" />
                {themeLabel(item.channel)} · {item.trendLabel} · 热度 {formatHeatScore(item.heatScore)} · 态势 {formatGoldstein(item.weightedGoldstein)}
              </strong>
              <i className="heat-bar">
                <b style={{ width: `${Math.max(8, Math.round((item.heatScore / maxHeat) * 100))}%` }} />
              </i>
            </button>
          );
        })}
        {items.length === 0 ? <div className="empty-detail">当前筛选下暂无结果。</div> : null}
      </div>
    </div>
  );
}
