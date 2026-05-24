import type { CSSProperties } from "react";
import type { HotspotChannelBreakdown, HotspotDetail, MapHotspot } from "@/lib/hotspots";

interface EnrichmentState {
  hotspotId: number;
  status: "running" | "success" | "error";
  message: string;
}

interface ChannelDetailProps {
  selected: HotspotDetail | null;
  channelBreakdown: HotspotChannelBreakdown[];
  selectedHotspotId: number | null;
  loading: boolean;
  message: string | null;
  enrichmentState: EnrichmentState | null;
  expandedStoryId: number | null;
  onToggleStory: (id: number) => void;
  onOpenChannelHotspot: (id: number) => void;
  channelColors: Record<string, string>;
  hotspotNeedsEnrichment: (hotspot: HotspotDetail) => boolean;
  situationColor: (hotspot: MapHotspot) => string;
  trendClassName: (trendLabel: string) => string;
  formatGoldstein: (value: number | null) => string;
  themeLabel: (channel: string) => string;
  flagText: (flag: string) => string;
}

function sourceThemePercent(item: HotspotChannelBreakdown, totalHeat: number) {
  const percent = (item.heatScore / Math.max(totalHeat, 1)) * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

function SourceThemeSwitcher({
  items,
  selectedHotspotId,
  channelColors,
  themeLabel,
  onOpenChannelHotspot,
}: {
  items: HotspotChannelBreakdown[];
  selectedHotspotId: number | null;
  channelColors: Record<string, string>;
  themeLabel: (channel: string) => string;
  onOpenChannelHotspot: (id: number) => void;
}) {
  if (!items.length) return null;

  const sortedItems = [...items].sort((left, right) => right.heatScore - left.heatScore);
  const totalHeat = sortedItems.reduce((sum, item) => sum + item.heatScore, 0);

  return (
    <section className="source-theme-switcher" aria-label="来源分析主题切换">
      <div className="section-heading">
        <p className="eyebrow">切换主题</p>
        <span>同一地区</span>
      </div>
      <div className="source-theme-buttons">
        {sortedItems.map((item) => {
          const color = channelColors[item.channel] ?? "#0f8f7f";
          const active = selectedHotspotId === item.hotspotId;
          return (
            <button
              key={item.hotspotId}
              type="button"
              className={`source-theme-button ${active ? "active" : ""}`}
              style={{ "--channel-color": color } as CSSProperties}
              onClick={() => onOpenChannelHotspot(item.hotspotId)}
            >
              <span>
                <i />
                {themeLabel(item.channel)}
              </span>
              <small>{sourceThemePercent(item, totalHeat)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ChannelDetail({
  selected,
  channelBreakdown,
  selectedHotspotId,
  loading,
  message,
  enrichmentState,
  expandedStoryId,
  onToggleStory,
  onOpenChannelHotspot,
  channelColors,
  hotspotNeedsEnrichment,
  situationColor,
  trendClassName,
  formatGoldstein,
  themeLabel,
  flagText,
}: ChannelDetailProps) {
  const switcher = (
    <SourceThemeSwitcher
      items={channelBreakdown}
      selectedHotspotId={selectedHotspotId}
      channelColors={channelColors}
      themeLabel={themeLabel}
      onOpenChannelHotspot={onOpenChannelHotspot}
    />
  );

  if (loading && !selected) {
    return (
      <article className="detail-panel">
        {switcher}
        <div className="empty-detail">正在加载主主题来源分析。</div>
      </article>
    );
  }

  if (!selected) {
    return (
      <article className="detail-panel">
        {switcher}
        <div className="empty-detail">{message ?? "选择一个主题查看代表来源、故事组和来源质量。"}</div>
      </article>
    );
  }

  return (
    <article className="detail-panel">
      {switcher}
      {loading ? <div className="empty-detail source-refreshing">正在刷新来源分析。</div> : null}
      {message && !loading ? <div className="empty-detail source-refreshing">{message}</div> : null}
      <div className="detail-hero channel-detail-hero">
        <p className="eyebrow">主题来源诊断</p>
        <h2>{selected.explanation.title}</h2>
        <div className="situation-badges">
          <span style={{ "--situation-color": situationColor(selected) } as CSSProperties}>
            <i />
            {selected.quadClassLabel}
          </span>
          <span className={trendClassName(selected.trendLabel)}>{selected.trendLabel}</span>
          <span>GDELT 态势倾向 {formatGoldstein(selected.weightedGoldstein)}</span>
        </div>
        <p className="detail-summary">{selected.explanation.whatHappened}</p>
        <div className="detail-metrics">
          <span>主题 {themeLabel(selected.channel)}</span>
          <span>{selected.sourceCount} 个来源</span>
          <span>{selected.domainCount} 个域名</span>
          <span>{selected.explanation.sourceQuality.fetchedSourceCount} 个代表来源</span>
          <span>
            {selected.explanation.sourceQuality.storyCount
              ? `${selected.explanation.sourceQuality.storyCount} 个故事组`
              : "故事组待补充"}
          </span>
        </div>
      </div>

      {hotspotNeedsEnrichment(selected) || enrichmentState ? (
        <div className={`enrichment-banner ${enrichmentState?.status ?? "running"}`}>
          <strong>
            {enrichmentState?.status === "error"
              ? "来源增强失败"
              : enrichmentState?.status === "success"
                ? "来源增强完成"
                : "正在补充来源信息"}
          </strong>
          <span>
            {enrichmentState?.message ??
              "正在抓取代表来源元数据，并生成故事组、主题和参与方信息。"}
          </span>
        </div>
      ) : null}

      <section className="detail-section">
        <p className="eyebrow">热点内故事组</p>
        <div className="story-list">
          {selected.storyGroups.map((story) => {
            const expanded = expandedStoryId === story.id;
            return (
              <div key={story.id} className="story-card">
                <button type="button" className="story-card-toggle" onClick={() => onToggleStory(story.id)}>
                  <span className="story-title">{story.title}</span>
                  <small>
                    {story.eventCount} 个事件 · {story.sourceCount} 个来源 · {story.sourceDomainCount} 个域名
                  </small>
                  <span className="story-summary">{story.summary}</span>
                  {story.qualityFlags.length ? (
                    <span className="flag-row">
                      {story.qualityFlags.map((flag) => (
                        <em key={flag}>{flagText(flag)}</em>
                      ))}
                    </span>
                  ) : null}
                </button>
                {expanded ? (
                  <span className="story-sources">
                    {story.sources.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        {source.title || source.domain || source.url}
                      </a>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
          {selected.storyGroups.length === 0 ? (
            <div className="empty-detail">
              {enrichmentState?.message ?? "当前仅有结构化事件数据，来源元数据和故事组仍在补充。"}
            </div>
          ) : null}
        </div>
      </section>

      <section className="detail-section">
        <p className="eyebrow">来源质量</p>
        <dl className="quality-grid">
          <div>
            <dt>候选来源</dt>
            <dd>{selected.explanation.sourceQuality.candidateSourceCount}</dd>
          </div>
          <div>
            <dt>代表来源</dt>
            <dd>{selected.explanation.sourceQuality.fetchedSourceCount}</dd>
          </div>
          <div>
            <dt>去重故事</dt>
            <dd>{selected.explanation.sourceQuality.storyCount}</dd>
          </div>
          <div>
            <dt>同源转载</dt>
            <dd>{selected.explanation.sourceQuality.duplicateSourceCount}</dd>
          </div>
          <div>
            <dt>旧文风险</dt>
            <dd>{selected.explanation.sourceQuality.oldSourceCount}</dd>
          </div>
          <div>
            <dt>主题覆盖</dt>
            <dd>{selected.explanation.sourceQuality.gkgCoveredSourceCount}</dd>
          </div>
        </dl>
      </section>

      <section className="detail-section">
        <p className="eyebrow">不确定性</p>
        {selected.explanation.uncertaintyWarnings.length ? (
          <ul className="compact-list">
            {selected.explanation.uncertaintyWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">当前代表来源未发现明显数据风险。</p>
        )}
      </section>

      <section className="detail-section">
        <p className="eyebrow">代表来源</p>
        <div className="source-list">
          {selected.representativeSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title || source.domain || source.url}
            </a>
          ))}
        </div>
      </section>
    </article>
  );
}
