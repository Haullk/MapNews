import type { CSSProperties } from "react";
import { RegionTrendPanel } from "@/components/panel/region-trend-panel";
import { ThemeDonutChart } from "@/components/panel/theme-donut-chart";
import type { MapHotspot, RegionTrend } from "@/lib/hotspots";

interface RegionDetailProps {
  region: MapHotspot;
  selectedHotspotId: number | null;
  rank: number | null;
  totalHotspots: number;
  regionTrend: RegionTrend | null;
  regionTrendMessage: string | null;
  onOpenChannelHotspot: (id: number) => void;
  channelColors: Record<string, string>;
  quadClassColors: Record<number, string>;
  situationColor: (hotspot: MapHotspot) => string;
  trendClassName: (trendLabel: string) => string;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
}

function heatLevelLabel(rank: number | null, heatScore: number) {
  if (rank !== null) {
    if (rank <= 3) return "全局高热";
    if (rank <= 10) return "高热度";
    if (rank <= 30) return "活跃热点";
  }
  if (heatScore >= 30000) return "高热度";
  if (heatScore >= 10000) return "活跃热点";
  return "普通热点";
}

function rankText(rank: number | null, totalHotspots: number) {
  if (rank === null) return totalHotspots > 0 ? `当前结果 ${totalHotspots} 个热点` : "当前视野内热点";
  return `排行第 ${rank}`;
}

function trendText(region: MapHotspot) {
  if (region.heatDelta === null) return region.trendLabel;
  if (region.heatDelta > 0) return "较昨日升温";
  if (region.heatDelta < 0) return "较昨日回落";
  return "较昨日持平";
}

function sourceCoverageText(sourceCount: number) {
  if (sourceCount >= 1000) return "来源覆盖广";
  if (sourceCount >= 200) return "多来源报道";
  if (sourceCount > 0) return "有来源可追溯";
  return "来源待补充";
}

function dominantThemes(region: MapHotspot, themeLabel: (channel: string) => string) {
  return region.channelBreakdown
    .slice(0, 3)
    .map((item) => themeLabel(item.channel))
    .join("、");
}

function overviewText(region: MapHotspot, themeLabel: (channel: string) => string) {
  const themes = dominantThemes(region, themeLabel) || themeLabel(region.channel);
  return `${region.regionName} 今天的报道信号较集中，主要围绕${themes}。${trendText(region)}，来源覆盖 ${region.sourceCount} 个，适合先从主题构成进入来源分析。`;
}

function actorLabel(name: string) {
  const labels: Record<string, string> = {
    "UNITED STATES": "美国",
    "THE US": "美国",
    "U.S.": "美国",
    "WASHINGTON": "华盛顿",
    "THE WHITE HOUSE": "白宫",
    "PRESIDENT": "总统",
    "IRAN": "伊朗",
    "NEW DELHI": "新德里",
    "CHINA": "中国",
    "RUSSIA": "俄罗斯",
  };
  if (labels[name]) return labels[name];
  if (name === name.toUpperCase()) {
    return name
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return name;
}

function groupedQuadShares(region: MapHotspot) {
  const total = Math.max(
    region.quadClassBreakdown.reduce((sum, item) => sum + item.eventCount, 0),
    1,
  );
  const cooperation = region.quadClassBreakdown
    .filter((item) => item.quadClass === 1 || item.quadClass === 2)
    .reduce((sum, item) => sum + item.eventCount, 0);
  const conflict = region.quadClassBreakdown
    .filter((item) => item.quadClass === 3 || item.quadClass === 4)
    .reduce((sum, item) => sum + item.eventCount, 0);
  return {
    cooperation: Math.round((cooperation / total) * 100),
    conflict: Math.round((conflict / total) * 100),
  };
}

export function RegionDetail({
  region,
  selectedHotspotId,
  rank,
  totalHotspots,
  regionTrend,
  regionTrendMessage,
  onOpenChannelHotspot,
  channelColors,
  quadClassColors,
  situationColor,
  trendClassName,
  formatGoldstein,
  themeLabel,
}: RegionDetailProps) {
  const maxQuadEvents = Math.max(...region.quadClassBreakdown.map((item) => item.eventCount), 1);
  const heatLabel = heatLevelLabel(rank, region.heatScore);
  const quadShares = groupedQuadShares(region);

  return (
    <article className="detail-panel">
      <div className="detail-hero region-detail-hero">
        <p className="eyebrow">热点概览</p>
        <h2>{region.regionName}</h2>
        <div className="situation-badges reader-badges">
          <span style={{ "--situation-color": situationColor(region) } as CSSProperties}>
            <i />
            {heatLabel}
          </span>
          <span className={trendClassName(region.trendLabel)}>{trendText(region)}</span>
          <span>主主题 {themeLabel(region.channel)}</span>
        </div>
        <p className="detail-summary">{overviewText(region, themeLabel)}</p>
        <div className="detail-metrics reader-metrics">
          <span>{rankText(rank, totalHotspots)}</span>
          <span>{sourceCoverageText(region.sourceCount)}</span>
          <span>{region.channelCount} 个主题</span>
          <span>{trendText(region)}</span>
        </div>
        <div className="supporting-metrics">
          <span>{region.eventCount} 个结构化信号</span>
          <span>{region.mentionCount} 次报道提及</span>
          <span>{region.sourceCount} 个来源</span>
        </div>
      </div>

      <section className="detail-section primary-section">
        <div className="section-heading">
          <p className="eyebrow">主题构成</p>
          <span>按热度占比</span>
        </div>
        <ThemeDonutChart
          items={region.channelBreakdown}
          totalHeat={region.heatScore}
          selectedHotspotId={selectedHotspotId}
          channelColors={channelColors}
          themeLabel={themeLabel}
          onSelectTheme={onOpenChannelHotspot}
        />
      </section>

      <section className="detail-section">
        <p className="eyebrow">报道中高频出现的对象</p>
        <div className="tag-cloud">
          {region.topActors.length ? (
            region.topActors.slice(0, 5).map((actor) => (
              <span key={actor.name}>{actorLabel(actor.name)} · {actor.count}</span>
            ))
          ) : (
            <span>暂无可用对象聚合</span>
          )}
        </div>
      </section>

      <section className="detail-section">
        <p className="eyebrow">90天趋势</p>
        <RegionTrendPanel trend={regionTrend} message={regionTrendMessage} />
      </section>

      <section className="detail-section situation-section">
        <p className="eyebrow">报道倾向</p>
        <div className="tone-summary-list">
          <div className="tone-summary-item cooperation">
            <span>合作相关</span>
            <strong>{quadShares.cooperation}%</strong>
            <em className="heat-bar">
              <b style={{ width: `${Math.max(5, quadShares.cooperation)}%` }} />
            </em>
          </div>
          <div className="tone-summary-item conflict">
            <span>冲突相关</span>
            <strong>{quadShares.conflict}%</strong>
            <em className="heat-bar">
              <b style={{ width: `${Math.max(5, quadShares.conflict)}%` }} />
            </em>
          </div>
        </div>
        <p className="muted-copy">
          GDELT 态势倾向 {formatGoldstein(region.weightedGoldstein)}，仅表示报道信号偏合作或冲突，不等同于现实世界结论。
        </p>
        {region.quadClassBreakdown.length ? (
          <details className="technical-breakdown">
            <summary>查看四象限细分</summary>
            <div className="quad-breakdown-list">
              {region.quadClassBreakdown.map((item) => {
                const color = quadClassColors[item.quadClass] ?? "#64748b";
                return (
                  <div
                    key={item.quadClass}
                    className="quad-breakdown-item"
                    style={{ "--situation-color": color } as CSSProperties}
                  >
                    <span>
                      <i />
                      {item.label}
                    </span>
                    <strong>{Math.round(item.share * 100)}%</strong>
                    <em className="heat-bar">
                      <b style={{ width: `${Math.max(5, Math.round((item.eventCount / maxQuadEvents) * 100))}%` }} />
                    </em>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </section>
    </article>
  );
}
