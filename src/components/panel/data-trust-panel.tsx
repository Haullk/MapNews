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
          当前地图使用 GDELT Events 结构化事件数据。它适合发现公开报道中的热点变化，但报道量不等于真实事件量，也会受媒体覆盖、语言和来源可见度影响。
        </p>
        <p>
          报道热度用于排序和气泡大小：ln(1 + 事件数) + ln(1 + 提及数) + ln(1 + 来源域名数)。log 处理会压缩超大报道量，减少少数高覆盖地区“一边倒”占榜。
        </p>
        <p>
          态势值使用 GDELT/CAMEO 的 Goldstein 分值做加权平均，通常在 -10 到 +10 之间；负值更偏冲突，正值更偏合作。它只表示报道信号倾向，不等同于现实结论。
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
        <div className="trust-references">
          <strong>参考依据</strong>
          <ul>
            <li>GDELT Codebook：GoldsteinScale 与 QuadClass 定义。</li>
            <li>Goldstein, 1992：合作/冲突事件强度量表。</li>
            <li>Wang et al., 2016：GDELT 自动事件数据存在噪音与偏差。</li>
            <li>BBVA Geopolitics Monitor：用历史基线和标准化降低报道量偏差。</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
