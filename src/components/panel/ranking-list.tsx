import type { CSSProperties } from "react";
import type { MapHotspot } from "@/lib/hotspots";

interface RankingListProps {
  items: MapHotspot[];
  maxHeat: number;
  visibleMarkerCount: number;
  totalHotspotCount: number;
  onLocate: (item: MapHotspot) => void;
  goldsteinColor: (value: number | null) => string;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
}

export function RankingList({
  items,
  maxHeat,
  visibleMarkerCount,
  totalHotspotCount,
  onLocate,
  goldsteinColor,
  formatGoldstein,
  themeLabel,
}: RankingListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading">
        <p className="eyebrow">态势排行</p>
        <span>
          地图显示 {visibleMarkerCount}/{totalHotspotCount}
        </span>
      </div>
      <div className="ranking-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ranking-item"
            style={{ "--situation-color": goldsteinColor(item.weightedGoldstein) } as CSSProperties}
            onClick={() => onLocate(item)}
          >
            <span>{item.regionName}</span>
            <strong>
              <i className="situation-dot" />
              GDELT {formatGoldstein(item.weightedGoldstein)} · {item.trendLabel}
            </strong>
            <small>
              {item.eventCount} 个事件 · {item.sourceCount} 个来源 · 主主题 {themeLabel(item.channel)}
            </small>
            <i className="heat-bar">
              <b style={{ width: `${Math.max(8, Math.round((item.heatScore / maxHeat) * 100))}%` }} />
            </i>
          </button>
        ))}
        {items.length === 0 ? <div className="empty-detail">当前筛选下暂无热点排行。</div> : null}
      </div>
    </div>
  );
}
