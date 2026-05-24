import { ChannelDetail } from "@/components/panel/channel-detail";
import { DataTrustPanel } from "@/components/panel/data-trust-panel";
import { RegionDetail } from "@/components/panel/region-detail";
import type { HotspotDetail, MapHotspot, RegionTrend } from "@/lib/hotspots";

export type DetailTab = "region" | "source";

interface EnrichmentState {
  hotspotId: number;
  status: "running" | "success" | "error";
  message: string;
}

interface DetailsDrawerProps {
  region: MapHotspot;
  selected: HotspotDetail | null;
  rank: number | null;
  totalHotspots: number;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  regionTrend: RegionTrend | null;
  regionTrendMessage: string | null;
  onOpenChannelHotspot: (id: number) => void;
  sourceLoading: boolean;
  sourceMessage: string | null;
  enrichmentState: EnrichmentState | null;
  expandedStoryId: number | null;
  onToggleStory: (id: number) => void;
  hotspotNeedsEnrichment: (hotspot: HotspotDetail) => boolean;
  channelColors: Record<string, string>;
  quadClassColors: Record<number, string>;
  situationColor: (hotspot: MapHotspot) => string;
  trendClassName: (trendLabel: string) => string;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
  flagText: (flag: string) => string;
}

export function DetailsDrawer({
  region,
  selected,
  rank,
  totalHotspots,
  activeTab,
  onTabChange,
  regionTrend,
  regionTrendMessage,
  onOpenChannelHotspot,
  sourceLoading,
  sourceMessage,
  enrichmentState,
  expandedStoryId,
  onToggleStory,
  hotspotNeedsEnrichment,
  channelColors,
  quadClassColors,
  situationColor,
  trendClassName,
  formatGoldstein,
  themeLabel,
  flagText,
}: DetailsDrawerProps) {
  return (
    <aside className="details-drawer" aria-label={`${region.regionName} 详情抽屉`}>
      <div className="drawer-header">
        <div>
          <p className="eyebrow">热点详情</p>
          <h2>{region.regionName}</h2>
        </div>
        <span>{region.dataDate}</span>
      </div>

      <div className="panel-tabs detail-tabs" role="tablist" aria-label="热点详情视图">
        <button
          type="button"
          className={activeTab === "region" ? "active" : ""}
          onClick={() => onTabChange("region")}
        >
          地区态势
        </button>
        <button
          type="button"
          className={activeTab === "source" ? "active" : ""}
          onClick={() => onTabChange("source")}
        >
          来源分析
        </button>
      </div>

      {activeTab === "region" ? (
        <RegionDetail
          region={region}
          selectedHotspotId={selected?.id ?? region.primaryHotspotId}
          rank={rank}
          totalHotspots={totalHotspots}
          regionTrend={regionTrend}
          regionTrendMessage={regionTrendMessage}
          onOpenChannelHotspot={onOpenChannelHotspot}
          channelColors={channelColors}
          quadClassColors={quadClassColors}
          situationColor={situationColor}
          trendClassName={trendClassName}
          formatGoldstein={formatGoldstein}
          themeLabel={themeLabel}
        />
      ) : (
        <ChannelDetail
          selected={selected}
          channelBreakdown={region.channelBreakdown}
          selectedHotspotId={selected?.id ?? region.primaryHotspotId}
          loading={sourceLoading}
          message={sourceMessage}
          enrichmentState={enrichmentState}
          expandedStoryId={expandedStoryId}
          onToggleStory={onToggleStory}
          onOpenChannelHotspot={onOpenChannelHotspot}
          channelColors={channelColors}
          hotspotNeedsEnrichment={hotspotNeedsEnrichment}
          situationColor={situationColor}
          trendClassName={trendClassName}
          formatGoldstein={formatGoldstein}
          themeLabel={themeLabel}
          flagText={flagText}
        />
      )}

      <DataTrustPanel region={region} selected={selected} formatGoldstein={formatGoldstein} />
    </aside>
  );
}
