import type { HotspotDetail, MapHotspot } from "@/lib/hotspots";

interface DataTrustPanelProps {
  region: MapHotspot;
  selected: HotspotDetail | null;
  formatGoldstein: (value: number | null) => string;
}

export function DataTrustPanel({ region, selected, formatGoldstein }: DataTrustPanelProps) {
  return (
    <details className="data-trust-panel">
      <summary>数据可信度与热度说明</summary>
      <div className="trust-content">
        <p>
          当前地图使用 GDELT Events 结构化事件数据。它适合发现报道信号和地区热点变化，但报道量不等于真实事件量，也会受媒体覆盖、语言和来源可见度影响。
        </p>
        <p>
          Goldstein 分值表示 GDELT 对事件合作/冲突倾向的规则评分，范围通常为 -10 到 +10；负值更偏冲突，正值更偏合作。
        </p>
        <p>
          频道热点热度公式：事件数*10 + 提及数*1.5 + 来源URL数*2 + 来源域名数*3 + 文章数*0.8。地区综合热度为该地区内频道热点热度汇总。
        </p>
        <dl className="quality-grid trust-metrics">
          <div>
            <dt>当前地区</dt>
            <dd>{region.regionName}</dd>
          </div>
          <div>
            <dt>数据日期</dt>
            <dd>{region.dataDate}</dd>
          </div>
          <div>
            <dt>地区事件</dt>
            <dd>{region.eventCount}</dd>
          </div>
          <div>
            <dt>地区来源</dt>
            <dd>{region.sourceCount}</dd>
          </div>
          <div>
            <dt>态势评分</dt>
            <dd>{formatGoldstein(region.weightedGoldstein)}</dd>
          </div>
          <div>
            <dt>来源更新时间</dt>
            <dd>{selected?.updatedAt ?? "尚未选择话题"}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
