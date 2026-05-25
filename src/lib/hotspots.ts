import { getPool } from "./db";

export const CHANNELS = ["国际", "冲突", "政治", "经济", "灾害", "社会"] as const;
export type Channel = (typeof CHANNELS)[number];
const DEFAULT_CHANNELS: readonly string[] = CHANNELS;
const THEME_LABELS: Record<string, string> = {
  国际: "国际关系",
  冲突: "冲突安全",
  政治: "政治治理",
  经济: "经济产业",
  灾害: "灾害事故",
  社会: "社会民生",
};

export interface QueryStatus {
  ok: boolean;
  message: string;
  emptyReason?: string;
}

export interface HotspotFilters {
  date?: string;
  channel?: string;
  /**
   * Low-level API/debug filter. The main workspace search uses map positioning
   * plus q-based keyword search and does not set region.
   */
  region?: string;
  q?: string;
  sort?: "heat" | "attitude";
  limit?: number;
  bbox?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface HotspotChannelBreakdown {
  hotspotId: number;
  channel: string;
  heatScore: number;
  eventCount: number;
  mentionCount: number;
  sourceCount: number;
  summary: string;
  baselineDays: number;
  relativeHeatZScore: number | null;
  scoreVersion: string;
}

export interface QuadClassBreakdown {
  quadClass: number;
  label: string;
  eventCount: number;
  share: number;
}

export interface TopActor {
  name: string;
  count: number;
}

export interface MapHotspot {
  id: number;
  regionKey: string;
  regionName: string;
  lat: number;
  lng: number;
  channel: string;
  primaryHotspotId: number;
  channelCount: number;
  channelBreakdown: HotspotChannelBreakdown[];
  heatScore: number;
  eventCount: number;
  mentionCount: number;
  sourceCount: number;
  dataDate: string;
  summary: string;
  dominantQuadClass: number | null;
  quadClassLabel: string;
  quadClassBreakdown: QuadClassBreakdown[];
  weightedGoldstein: number | null;
  goldsteinMin: number | null;
  goldsteinMax: number | null;
  heatDelta: number | null;
  trendLabel: string;
  baselineMean: number | null;
  baselineStddev: number | null;
  baselineDays: number;
  relativeHeatZScore: number | null;
  scoreVersion: string;
  topActors: TopActor[];
}

export interface HotspotSource {
  url: string;
  domain: string | null;
  title: string | null;
}

export interface HotspotTopic {
  name: string;
  count: number;
}

export interface HotspotEntity {
  name: string;
  type?: string;
  count: number;
}

export interface StoryGroupSource {
  url: string;
  domain: string | null;
  title: string | null;
  publishedAt: string | null;
  rank: number;
  isDuplicate: boolean;
  duplicateOfUrl: string | null;
  qualityFlags: string[];
}

export interface StoryGroup {
  id: number;
  title: string;
  summary: string;
  eventCount: number;
  mentionCount: number;
  sourceCount: number;
  sourceDomainCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  topics: HotspotTopic[];
  entities: HotspotEntity[];
  qualityFlags: string[];
  sources: StoryGroupSource[];
}

export interface SourceQuality {
  enhanced: boolean;
  sourceCount: number;
  candidateSourceCount: number;
  fetchedSourceCount: number;
  sourceDomainCount: number;
  storyCount: number;
  duplicateSourceCount: number;
  oldSourceCount: number;
  missingTitleCount: number;
  gkgCoveredSourceCount: number;
  firstMentionAt: string | null;
  latestMentionAt: string | null;
}

export interface HotspotExplanation {
  title: string;
  whatHappened: string;
  importanceReasons: string[];
  sourceQuality: SourceQuality;
  uncertaintyWarnings: string[];
  topics: HotspotTopic[];
  entities: HotspotEntity[];
  generatedAt: string | null;
}

export interface HotspotDetail extends MapHotspot {
  articleCount: number;
  domainCount: number;
  updatedAt: string;
  representativeSources: HotspotSource[];
  explanation: HotspotExplanation;
  storyGroups: StoryGroup[];
}

export interface DailyBrief {
  dataDate: string | null;
  hotspotCount: number;
  hotspotDelta: number | null;
  topRegions: Array<{ name: string; count: number }>;
  topChannels: Array<{ name: string; count: number }>;
  freshnessText: string;
  completenessText: string;
  briefText: string;
}

export interface ImportBatchStatus {
  importDate: string;
  status: string;
  processingStatus: string;
  eventsStatus: string;
  mentionsStatus: string;
  gkgStatus: string;
  filesAttempted: number;
  filesImported: number;
  filesRegistered: number;
  filesFinished: number;
  rowsInserted: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface DataStatus {
  databaseAvailable: boolean;
  currentDataDate: string | null;
  latestSuccessfulImportDate: string | null;
  eventsReady: boolean;
  mentionsReady: boolean;
  gkgReady: boolean;
  isComplete: boolean;
  message: string;
  latestImportBatch: ImportBatchStatus | null;
}

export interface InitialWorkspaceData {
  dates: string[];
  channels: readonly string[];
  databaseReady: boolean;
  status: DataStatus;
  initialHotspots: MapHotspot[];
  initialHotspotStatus: QueryStatus;
}

export interface RegionTrendPoint {
  dataDate: string;
  isMissing: boolean;
  heatScore: number;
  heatDelta: number | null;
  trendLabel: string;
  eventCount: number;
  mentionCount: number;
  sourceCount: number;
  weightedGoldstein: number | null;
  goldsteinMin: number | null;
  goldsteinMax: number | null;
  dominantQuadClass: number | null;
  quadClassLabel: string;
  quadClassBreakdown: QuadClassBreakdown[];
  baselineMean: number | null;
  baselineStddev: number | null;
  baselineDays: number;
  relativeHeatZScore: number | null;
  scoreVersion: string | null;
  channel: string | null;
  channelCount: number;
  channelBreakdown: HotspotChannelBreakdown[];
}

export interface RegionTrend {
  regionKey: string;
  regionName: string;
  days: number;
  startDate: string | null;
  endDate: string | null;
  scoreVersion: string | null;
  mixedScoreVersions: boolean;
  hiddenVersionDays: number;
  points: RegionTrendPoint[];
}

export interface RegionEvent {
  id: number;
  eventDate: string;
  eventDatetime: string | null;
  dateAdded: string | null;
  eventCode: string | null;
  eventBaseCode: string | null;
  eventRootCode: string | null;
  eventLabel: string;
  channel: string;
  quadClass: number | null;
  quadClassLabel: string;
  actor1Name: string | null;
  actor2Name: string | null;
  goldsteinScale: number | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
}

function numberValue(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
}

function themeLabel(channel: string) {
  return THEME_LABELS[channel] ?? channel;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quadClassLabel(quadClass: number | null) {
  switch (quadClass) {
    case 1:
      return "口头合作";
    case 2:
      return "实质合作";
    case 3:
      return "口头冲突";
    case 4:
      return "实质冲突";
    default:
      return "混合态势";
  }
}

function eventCodeLabel(eventCode: string | null, eventRootCode?: string | null, eventBaseCode?: string | null) {
  const root = (eventRootCode || eventBaseCode || eventCode || "").slice(0, 2);
  const labels: Record<string, string> = {
    "01": "公开声明",
    "02": "呼吁/倡议",
    "03": "合作意向",
    "04": "磋商/外交接触",
    "05": "外交合作",
    "06": "物质合作",
    "07": "援助/救助",
    "08": "让步/妥协",
    "09": "调查",
    "10": "要求",
    "11": "反对",
    "12": "拒绝",
    "13": "威胁",
    "14": "抗议",
    "15": "军事姿态",
    "16": "关系削减",
    "17": "胁迫",
    "18": "攻击",
    "19": "战斗",
    "20": "非常规暴力",
  };
  return labels[root] ?? (eventCode ? `事件代码 ${eventCode}` : "未知事件");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function topicArray(value: unknown): HotspotTopic[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return {
        name: String(record.name ?? ""),
        count: numberValue(record.count),
      };
    })
    .filter((item): item is HotspotTopic => item !== null && item.name.length > 0);
}

function entityArray(value: unknown): HotspotEntity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const entity: HotspotEntity = {
        name: String(record.name ?? ""),
        count: numberValue(record.count),
      };
      if (typeof record.type === "string") entity.type = record.type;
      return entity;
    })
    .filter((item): item is HotspotEntity => item !== null && item.name.length > 0);
}

function channelBreakdownArray(value: unknown): HotspotChannelBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const hotspotId = numberValue(record.hotspotId);
      const channel = String(record.channel ?? "");
      if (!hotspotId || !channel) return null;
      return {
        hotspotId,
        channel,
        heatScore: numberValue(record.heatScore),
        eventCount: numberValue(record.eventCount),
        mentionCount: numberValue(record.mentionCount),
        sourceCount: numberValue(record.sourceCount),
        summary: String(record.summary ?? ""),
        baselineDays: numberValue(record.baselineDays),
        relativeHeatZScore: numberOrNull(record.relativeHeatZScore as number | string | null | undefined),
        scoreVersion: String(record.scoreVersion ?? "legacy-v1"),
      };
    })
    .filter((item): item is HotspotChannelBreakdown => item !== null);
}

function quadClassBreakdownArray(value: unknown): QuadClassBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const quadClass = numberValue(record.quadClass ?? record.quad_class);
      if (![1, 2, 3, 4].includes(quadClass)) return null;
      return {
        quadClass,
        label: String(record.label ?? quadClassLabel(quadClass)),
        eventCount: numberValue(record.eventCount ?? record.event_count),
        share: numberValue(record.share),
      };
    })
    .filter((item): item is QuadClassBreakdown => item !== null);
}

function topActorArray(value: unknown): TopActor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "");
      if (!name) return null;
      return {
        name,
        count: numberValue(record.count ?? record.eventCount ?? record.event_count),
      };
    })
    .filter((item): item is TopActor => item !== null);
}

function sourceQuality(value: unknown, fallback: { sourceCount: number; domainCount: number }): SourceQuality {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enhanced: Boolean(record.enhanced),
    sourceCount: numberValue(record.sourceCount ?? fallback.sourceCount),
    candidateSourceCount: numberValue(record.candidateSourceCount),
    fetchedSourceCount: numberValue(record.fetchedSourceCount),
    sourceDomainCount: numberValue(record.sourceDomainCount ?? fallback.domainCount),
    storyCount: numberValue(record.storyCount),
    duplicateSourceCount: numberValue(record.duplicateSourceCount),
    oldSourceCount: numberValue(record.oldSourceCount),
    missingTitleCount: numberValue(record.missingTitleCount),
    gkgCoveredSourceCount: numberValue(record.gkgCoveredSourceCount),
    firstMentionAt: typeof record.firstMentionAt === "string" ? record.firstMentionAt : null,
    latestMentionAt: typeof record.latestMentionAt === "string" ? record.latestMentionAt : null,
  };
}

function hotspotFromRow(row: {
  id: number;
  region_key?: string;
  region_name: string;
  centroid_lat: number | string;
  centroid_long: number | string;
  channel: string;
  primary_hotspot_id?: number | string;
  channel_count?: number | string;
  channel_breakdown?: unknown;
  heat_score: number | string;
  event_count: number | string;
  mention_count: number | string;
  source_count: number | string;
  data_date: string;
  summary: string;
  dominant_quad_class?: number | string | null;
  quad_class_breakdown?: unknown;
  weighted_goldstein?: number | string | null;
  goldstein_min?: number | string | null;
  goldstein_max?: number | string | null;
  heat_delta?: number | string | null;
  trend_label?: string | null;
  baseline_mean?: number | string | null;
  baseline_stddev?: number | string | null;
  baseline_days?: number | string | null;
  relative_heat_zscore?: number | string | null;
  score_version?: string | null;
  top_actors?: unknown;
}): MapHotspot {
  const id = Number(row.id);
  const heatScore = Number(row.heat_score);
  const eventCount = Number(row.event_count);
  const mentionCount = Number(row.mention_count);
  const sourceCount = Number(row.source_count);
  const primaryHotspotId = Number(row.primary_hotspot_id ?? row.id);
  const channelBreakdown = channelBreakdownArray(row.channel_breakdown);
  const dominantQuadClass = numberOrNull(row.dominant_quad_class);
  const quadBreakdown = quadClassBreakdownArray(row.quad_class_breakdown);
  const summary = row.summary
    .replace("主频道为", "主题为")
    .replace("主主题为", "主题为")
    .replace(`主题为${row.channel}`, `主题为${themeLabel(row.channel)}`)
    .replace(`出现${row.channel}类热点`, `出现${themeLabel(row.channel)}主题热点`)
    .replace("个频道", "个主题");
  return {
    id,
    regionKey: row.region_key ?? row.region_name,
    regionName: row.region_name,
    lat: Number(row.centroid_lat),
    lng: Number(row.centroid_long),
    channel: row.channel,
    primaryHotspotId,
    channelCount: numberValue(row.channel_count ?? (channelBreakdown.length || 1)),
    channelBreakdown:
      channelBreakdown.length > 0
        ? channelBreakdown
        : [
            {
              hotspotId: primaryHotspotId,
              channel: row.channel,
              heatScore,
              eventCount,
              mentionCount,
              sourceCount,
              summary,
              baselineDays: numberValue(row.baseline_days),
              relativeHeatZScore: numberOrNull(row.relative_heat_zscore),
              scoreVersion: row.score_version ?? "legacy-v1",
            },
          ],
    heatScore,
    eventCount,
    mentionCount,
    sourceCount,
    dataDate: row.data_date,
    summary,
    dominantQuadClass,
    quadClassLabel: quadClassLabel(dominantQuadClass),
    quadClassBreakdown: quadBreakdown,
    weightedGoldstein: numberOrNull(row.weighted_goldstein),
    goldsteinMin: numberOrNull(row.goldstein_min),
    goldsteinMax: numberOrNull(row.goldstein_max),
    heatDelta: numberOrNull(row.heat_delta),
    trendLabel: row.trend_label || "基线不足",
    baselineMean: numberOrNull(row.baseline_mean),
    baselineStddev: numberOrNull(row.baseline_stddev),
    baselineDays: numberValue(row.baseline_days),
    relativeHeatZScore: numberOrNull(row.relative_heat_zscore),
    scoreVersion: row.score_version ?? "legacy-v1",
    topActors: topActorArray(row.top_actors),
  };
}

export async function getDefaultDate(): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query<{ data_date: string }>(
    "select data_date::text from map_hotspots order by data_date desc limit 1",
  );
  return result.rows[0]?.data_date ?? null;
}

export async function getInitialWorkspaceData(): Promise<InitialWorkspaceData> {
  try {
    const pool = getPool();
    const [dates, channels, status, hotspotResult] = await Promise.all([
      pool.query<{ data_date: string }>("select distinct data_date::text from map_hotspots order by data_date desc limit 90"),
      getAvailableChannels(),
      getDataStatus(),
      queryMapHotspots({ limit: 500 }),
    ]);
    return {
      dates: dates.rows.map((row) => row.data_date),
      channels,
      databaseReady: status.databaseAvailable,
      status,
      initialHotspots: hotspotResult.hotspots,
      initialHotspotStatus: hotspotResult.status,
    };
  } catch {
    return {
      dates: [],
      channels: DEFAULT_CHANNELS,
      databaseReady: false,
      status: databaseDownStatus(),
      initialHotspots: [],
      initialHotspotStatus: {
        ok: false,
        message: "数据库暂不可用，无法加载初始态势热点。",
        emptyReason: "database_unavailable",
      },
    };
  }
}

export async function getAvailableChannels(): Promise<readonly string[]> {
  const pool = getPool();
  const result = await pool.query<{ channel: string }>(
    `
      select channel, min(priority) as priority
      from gdelt_channel_mappings
      where enabled = true
      group by channel
      order by min(priority), channel
    `,
  );
  const channels = result.rows.map((row) => row.channel);
  return channels.length > 0 ? channels : DEFAULT_CHANNELS;
}

function searchChannels(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return Object.entries(THEME_LABELS)
    .filter(([channel, label]) => channel.toLowerCase().includes(normalized) || label.toLowerCase().includes(normalized))
    .map(([channel]) => channel);
}

function searchTermPatterns(query: string) {
  const normalized = query.trim();
  const lower = normalized.toLowerCase();
  const terms = new Set([normalized]);
  if (normalized.includes("俄乌")) {
    terms.add("Russia");
    terms.add("Ukraine");
    terms.add("Russian");
    terms.add("Ukrainian");
  }
  if (normalized.includes("中美")) {
    terms.add("China");
    terms.add("United States");
    terms.add("USA");
  }
  if (normalized.includes("地震") || lower.includes("earthquake")) {
    terms.add("earthquake");
    terms.add("quake");
    terms.add("seismic");
  }
  if (normalized.includes("贸易") || lower.includes("trade")) {
    terms.add("trade");
    terms.add("tariff");
  }
  return Array.from(terms).map((term) => `%${term}%`);
}

function escapeSqlRegex(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function regionSearchPattern(region: string) {
  const normalized = region.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return `(^|[^[:alnum:]_])${escapeSqlRegex(normalized)}([^[:alnum:]_]|$)`;
}

function searchEventCodePatterns(query: string) {
  const matches = query.trim().match(/\b\d{2,4}\b/g) ?? [];
  return Array.from(new Set(matches)).map((term) => `${term}%`);
}

function applyFilters(filters: HotspotFilters, params: Array<string | number | string[]>, where: string[]) {
  if (filters.date) {
    params.push(filters.date);
    where.push(`h.data_date = $${params.length}::date`);
  }
  if (filters.channel) {
    params.push(filters.channel);
    where.push(`h.channel = $${params.length}`);
  }
  // Keep region as an explicit API/debug capability; the main UI does not send it.
  if (filters.region) {
    const pattern = regionSearchPattern(filters.region);
    if (pattern) {
      params.push(pattern);
      where.push(`h.region_name ~* $${params.length}`);
    }
  }
  if (filters.q && filters.q.trim().length >= 2) {
    const query = filters.q.trim();
    params.push(searchTermPatterns(query));
    const likeParam = `$${params.length}::text[]`;
    const channels = searchChannels(query);
    let channelClause = "";
    if (channels.length > 0) {
      params.push(channels);
      channelClause = `or h.channel = any($${params.length}::text[])`;
    }
    const eventCodePatterns = searchEventCodePatterns(query);
    let eventCodeClause = "";
    if (eventCodePatterns.length > 0) {
      params.push(eventCodePatterns);
      const eventCodeParam = `$${params.length}::text[]`;
      eventCodeClause = `
        or exists (
          select 1
          from gdelt_events_clean e
          where e.event_date = h.data_date
            and e.region_key = h.region_key
            and e.channel = h.channel
            and (
              e.event_code ilike any(${eventCodeParam})
              or e.event_base_code ilike any(${eventCodeParam})
              or e.event_root_code ilike any(${eventCodeParam})
            )
        )
      `;
    }
    where.push(`
      (
        h.region_name ilike any(${likeParam})
        or h.summary ilike any(${likeParam})
        or h.channel ilike any(${likeParam})
        or h.top_actors::text ilike any(${likeParam})
        ${channelClause}
        or exists (
          select 1
          from map_hotspot_sources s
          left join article_metadata a on a.url = s.source_url
          where s.hotspot_id = h.id
            and (
              s.title ilike any(${likeParam})
              or s.source_domain ilike any(${likeParam})
              or s.source_url ilike any(${likeParam})
              or a.title ilike any(${likeParam})
              or a.description ilike any(${likeParam})
              or a.excerpt ilike any(${likeParam})
            )
        )
        ${eventCodeClause}
      )
    `);
  }
  if (filters.bbox) {
    params.push(filters.bbox.west, filters.bbox.south, filters.bbox.east, filters.bbox.north);
    where.push(
      `h.geom && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`,
    );
  }
}

export async function queryMapHotspots(filters: HotspotFilters) {
  const pool = getPool();
  const where: string[] = [];
  const params: Array<string | number | string[]> = [];
  const date = filters.date ?? (await getDefaultDate());
  applyFilters({ ...filters, date: date ?? undefined }, params, where);
  params.push(Math.min(Math.max(filters.limit ?? 500, 1), 1200));
  const orderBy =
    filters.sort === "attitude"
      ? "weighted_goldstein asc nulls last, heat_score desc, event_count desc, region_name asc"
      : "heat_score desc, event_count desc, region_name asc";

  const result = await pool.query<
    Parameters<typeof hotspotFromRow>[0]
  >(
    `
      with filtered as (
        select h.*
        from map_hotspots h
        ${where.length ? `where ${where.join(" and ")}` : ""}
      ),
      quad_source as (
        select
          f.data_date,
          f.region_key,
          (item->>'quadClass')::int as quad_class,
          sum(coalesce((item->>'eventCount')::numeric, 0)) as event_count
        from filtered f
        cross join lateral jsonb_array_elements(f.quad_class_breakdown) item
        where item ? 'quadClass'
        group by f.data_date, f.region_key, (item->>'quadClass')::int
      ),
      quad_totals as (
        select
          data_date,
          region_key,
          quad_class,
          event_count,
          sum(event_count) over (partition by data_date, region_key) as total_event_count
        from quad_source
      ),
      quad_summary as (
        select
          data_date,
          region_key,
          (array_agg(quad_class order by event_count desc, quad_class desc))[1] as dominant_quad_class,
          jsonb_agg(
            jsonb_build_object(
              'quadClass', quad_class,
              'label', case quad_class
                when 1 then '口头合作'
                when 2 then '实质合作'
                when 3 then '口头冲突'
                when 4 then '实质冲突'
                else '混合态势'
              end,
              'eventCount', event_count,
              'share', event_count / nullif(total_event_count, 0)
            )
            order by event_count desc, quad_class desc
          ) as quad_class_breakdown
        from quad_totals
        group by data_date, region_key
      ),
      actor_source as (
        select
          f.data_date,
          f.region_key,
          actor->>'name' as name,
          sum(coalesce((actor->>'count')::numeric, (actor->>'eventCount')::numeric, (actor->>'event_count')::numeric, 0)) as count
        from filtered f
        cross join lateral jsonb_array_elements(f.top_actors) actor
        where actor ? 'name' and actor->>'name' <> ''
        group by f.data_date, f.region_key, actor->>'name'
      ),
      actor_ranked as (
        select
          data_date,
          region_key,
          name,
          count,
          row_number() over (partition by data_date, region_key order by count desc, name asc) as rank
        from actor_source
      ),
      actor_summary as (
        select
          data_date,
          region_key,
          jsonb_agg(jsonb_build_object('name', name, 'count', count) order by count desc, name asc) as top_actors
        from actor_ranked
        where rank <= 8
        group by data_date, region_key
      ),
      weighted_source as (
        select
          *,
          case
            when goldstein_weight > 0 then goldstein_weight
            when score_version = 'legacy-v1' and weighted_goldstein is not null then greatest(event_count, 1)
            else 0
          end as effective_goldstein_weight
        from filtered
      ),
      grouped as (
        select
          (array_agg(id order by heat_score desc, event_count desc, id asc))[1] as id,
          (array_agg(id order by heat_score desc, event_count desc, id asc))[1] as primary_hotspot_id,
          data_date,
          region_key,
          (array_agg(region_name order by heat_score desc, event_count desc, id asc))[1] as region_name,
          (array_agg(channel order by heat_score desc, event_count desc, id asc))[1] as channel,
          sum(centroid_lat * greatest(event_count, 1)) / nullif(sum(greatest(event_count, 1)), 0) as centroid_lat,
          sum(centroid_long * greatest(event_count, 1)) / nullif(sum(greatest(event_count, 1)), 0) as centroid_long,
          sum(heat_score) as heat_score,
          sum(event_count) as event_count,
          sum(mention_count) as mention_count,
          sum(source_count) as source_count,
          sum(effective_goldstein_weight) as goldstein_weight,
          sum(weighted_goldstein * effective_goldstein_weight)
            / nullif(sum(case when weighted_goldstein is not null then effective_goldstein_weight else 0 end), 0) as weighted_goldstein,
          min(goldstein_min) as goldstein_min,
          max(goldstein_max) as goldstein_max,
          case
            when count(*) filter (where baseline_days >= 3 and baseline_mean is not null) = count(*)
            then sum(baseline_mean)
            else null
          end as baseline_mean,
          case
            when count(*) filter (where baseline_days >= 3 and baseline_stddev is not null) = count(*)
            then sqrt(sum(power(greatest(baseline_stddev, 0.25), 2)))
            else null
          end as baseline_stddev,
          coalesce(min(baseline_days), 0) as baseline_days,
          (array_agg(score_version order by heat_score desc, event_count desc, id asc))[1] as score_version,
          count(*) as channel_count,
          jsonb_agg(
            jsonb_build_object(
              'hotspotId', id,
              'channel', channel,
              'heatScore', heat_score,
              'eventCount', event_count,
              'mentionCount', mention_count,
              'sourceCount', source_count,
              'summary', summary,
              'baselineDays', baseline_days,
              'relativeHeatZScore', relative_heat_zscore,
              'scoreVersion', score_version
            )
            order by heat_score desc, event_count desc, id asc
          ) as channel_breakdown
        from weighted_source
        group by data_date, region_key
      )
      select id, primary_hotspot_id, data_date::text, region_key, region_name, channel,
             centroid_lat, centroid_long, heat_score, event_count, mention_count, source_count,
             channel_count, channel_breakdown, qs.dominant_quad_class, qs.quad_class_breakdown,
             weighted_goldstein, goldstein_min, goldstein_max, goldstein_weight,
             baseline_mean, baseline_stddev, baseline_days, score_version,
             case
               when baseline_days < 3 or baseline_mean is null or baseline_stddev is null then null
               else heat_score - baseline_mean
             end as heat_delta,
             case
               when baseline_days < 3 or baseline_mean is null or baseline_stddev is null then null
               else (heat_score - baseline_mean) / greatest(baseline_stddev, 0.25)
             end as relative_heat_zscore,
             case
               when baseline_days < 3 or baseline_mean is null or baseline_stddev is null then '基线不足'
               when (heat_score - baseline_mean) / greatest(baseline_stddev, 0.25) >= 2 then '显著升温'
               when (heat_score - baseline_mean) / greatest(baseline_stddev, 0.25) >= 1 then '升温'
               when (heat_score - baseline_mean) / greatest(baseline_stddev, 0.25) <= -1 then '冷却'
               else '平稳'
             end as trend_label,
             coalesce(actor_summary.top_actors, '[]'::jsonb) as top_actors,
             concat(
               data_date::text, '，', region_name, '出现地区综合热点，主题为', channel,
               '，包含 ', event_count, ' 个事件、', mention_count,
               ' 次相关报道提及，覆盖 ', channel_count, ' 个主题。'
             ) as summary
      from grouped
      left join quad_summary qs using (data_date, region_key)
      left join actor_summary using (data_date, region_key)
      order by ${orderBy}
      limit $${params.length}
    `,
    params,
  );
  const hotspots = result.rows.map(hotspotFromRow);
  return {
    hotspots,
    status: {
      ok: true,
      message: hotspots.length ? "态势热点已更新" : "当前区域暂无态势热点，可调整地图范围或主题筛选。",
      emptyReason: hotspots.length ? undefined : "empty",
    } satisfies QueryStatus,
  };
}

export async function getHotspotDetail(id: number): Promise<HotspotDetail | null> {
  const pool = getPool();
  const [hotspotResult, sourceResult, explanationResult, storyResult] = await Promise.all([
    pool.query<Parameters<typeof hotspotFromRow>[0] & {
      article_count: number | string;
      source_domain_count: number | string;
      data_updated_at: string;
    }>(
      `
        select id, region_key, region_name, centroid_lat, centroid_long, channel, heat_score,
               event_count, mention_count, article_count, source_count, source_domain_count,
               data_date::text, summary, dominant_quad_class, quad_class_breakdown,
               weighted_goldstein, goldstein_min, goldstein_max, heat_delta, trend_label,
               baseline_mean, baseline_stddev, baseline_days, relative_heat_zscore,
               score_version, top_actors, data_updated_at::text
        from map_hotspots
        where id = $1
      `,
      [id],
    ),
    pool.query<{ source_url: string; source_domain: string | null; title: string | null }>(
      `
        select s.source_url, s.source_domain, coalesce(s.title, a.title) as title
        from map_hotspot_sources s
        left join article_metadata a on a.url = s.source_url
        where s.hotspot_id = $1
        order by s.source_rank asc
        limit 8
      `,
      [id],
    ),
    pool.query<{
      title: string;
      what_happened: string;
      importance_reasons: unknown;
      source_quality: unknown;
      uncertainty_warnings: unknown;
      topics: unknown;
      entities: unknown;
      generated_at: string;
    }>(
      `
        select title, what_happened, importance_reasons, source_quality,
               uncertainty_warnings, topics, entities, generated_at::text
        from hotspot_explanations
        where hotspot_id = $1
      `,
      [id],
    ),
    pool.query<{
      id: number;
      representative_title: string;
      summary: string;
      event_count: number | string;
      mention_count: number | string;
      source_count: number | string;
      source_domain_count: number | string;
      first_seen_at: string | null;
      last_seen_at: string | null;
      topics: unknown;
      entities: unknown;
      quality_flags: unknown;
    }>(
      `
        select id, representative_title, summary, event_count, mention_count, source_count,
               source_domain_count, first_seen_at::text, last_seen_at::text, topics, entities, quality_flags
        from hotspot_story_groups
        where hotspot_id = $1
        order by source_count desc, mention_count desc, id asc
        limit 5
      `,
      [id],
    ),
  ]);
  const row = hotspotResult.rows[0];
  if (!row) return null;
  const storyIds = storyResult.rows.map((story) => Number(story.id));
  const storySources =
    storyIds.length === 0
      ? []
      : (
          await pool.query<{
            story_group_id: number;
            source_url: string;
            source_domain: string | null;
            title: string | null;
            published_at: string | null;
            source_rank: number | string;
            is_duplicate: boolean;
            duplicate_of_url: string | null;
            quality_flags: unknown;
          }>(
            `
              select story_group_id, source_url, source_domain, title, published_at::text,
                     source_rank, is_duplicate, duplicate_of_url, quality_flags
              from story_group_sources
              where story_group_id = any($1::bigint[])
              order by story_group_id, source_rank asc
            `,
            [storyIds],
          )
        ).rows;
  const sourcesByStory = new Map<number, StoryGroupSource[]>();
  for (const source of storySources) {
    const storyId = Number(source.story_group_id);
    const sources = sourcesByStory.get(storyId) ?? [];
    sources.push({
      url: source.source_url,
      domain: source.source_domain,
      title: source.title,
      publishedAt: source.published_at,
      rank: numberValue(source.source_rank),
      isDuplicate: source.is_duplicate,
      duplicateOfUrl: source.duplicate_of_url,
      qualityFlags: stringArray(source.quality_flags),
    });
    sourcesByStory.set(storyId, sources);
  }
  const fallbackQuality = { sourceCount: numberValue(row.source_count), domainCount: numberValue(row.source_domain_count) };
  const explanationRow = explanationResult.rows[0];
  const explanation: HotspotExplanation = explanationRow
    ? {
        title: explanationRow.title,
        whatHappened: explanationRow.what_happened,
        importanceReasons: stringArray(explanationRow.importance_reasons),
        sourceQuality: sourceQuality(explanationRow.source_quality, fallbackQuality),
        uncertaintyWarnings: stringArray(explanationRow.uncertainty_warnings),
        topics: topicArray(explanationRow.topics),
        entities: entityArray(explanationRow.entities),
        generatedAt: explanationRow.generated_at,
      }
    : {
        title: row.summary,
        whatHappened: row.summary,
        importanceReasons: ["当前热点主要依据事件数量、报道提及和来源域名计算报道热度。"],
        sourceQuality: { ...sourceQuality(null, fallbackQuality), enhanced: false },
        uncertaintyWarnings: ["当前仅有 GDELT 结构化事件信号，正在补充来源元数据和故事组。"],
        topics: [],
        entities: [],
        generatedAt: null,
      };
  return {
    ...hotspotFromRow(row),
    articleCount: numberValue(row.article_count),
    domainCount: numberValue(row.source_domain_count),
    updatedAt: row.data_updated_at,
    representativeSources: sourceResult.rows.map((source) => ({
      url: source.source_url,
      domain: source.source_domain,
      title: source.title,
    })),
    explanation,
    storyGroups: storyResult.rows.map((story) => ({
      id: Number(story.id),
      title: story.representative_title,
      summary: story.summary,
      eventCount: numberValue(story.event_count),
      mentionCount: numberValue(story.mention_count),
      sourceCount: numberValue(story.source_count),
      sourceDomainCount: numberValue(story.source_domain_count),
      firstSeenAt: story.first_seen_at,
      lastSeenAt: story.last_seen_at,
      topics: topicArray(story.topics),
      entities: entityArray(story.entities),
      qualityFlags: stringArray(story.quality_flags),
      sources: sourcesByStory.get(Number(story.id)) ?? [],
    })),
  };
}

export async function canRunHotspotEnrichment(id: number) {
  const pool = getPool();
  const result = await pool.query<{ has_clean_data: boolean }>(
    `
      select exists (
        select 1
        from map_hotspots h
        join gdelt_events_clean e
          on e.event_date = h.data_date
         and e.region_key = h.region_key
         and e.channel = h.channel
        where h.id = $1
        limit 1
      ) as has_clean_data
    `,
    [id],
  );
  const hasCleanData = Boolean(result.rows[0]?.has_clean_data);
  return {
    ok: hasCleanData,
    message: hasCleanData
      ? "该热点可以继续补充来源详情。"
      : "原始和清洗中间数据已清理，无法继续补充来源详情。",
  };
}

export async function queryRegionEvents(regionKey: string, date: string, limit = 30) {
  const pool = getPool();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const result = await pool.query<{
    global_event_id: number | string;
    event_date: string;
    event_datetime: string | null;
    date_added: string | null;
    actor1_name: string | null;
    actor2_name: string | null;
    event_code: string | null;
    event_base_code: string | null;
    event_root_code: string | null;
    channel: string;
    quad_class: number | string | null;
    goldstein_scale: number | string | null;
    source_url: string | null;
    source_domain: string | null;
  }>(
    `
      select
        global_event_id,
        event_date::text,
        event_datetime::text,
        date_added::text,
        actor1_name,
        actor2_name,
        event_code,
        event_base_code,
        event_root_code,
        channel,
        quad_class,
        goldstein_scale,
        source_url,
        source_domain
      from gdelt_events_clean
      where region_key = $1
        and event_date = $2::date
      order by coalesce(event_datetime, date_added) desc nulls last, global_event_id desc
      limit $3
    `,
    [regionKey, date, boundedLimit],
  );
  const events: RegionEvent[] = result.rows.map((row) => {
    const quadClass = numberOrNull(row.quad_class);
    return {
      id: Number(row.global_event_id),
      eventDate: row.event_date,
      eventDatetime: row.event_datetime,
      dateAdded: row.date_added,
      eventCode: row.event_code,
      eventBaseCode: row.event_base_code,
      eventRootCode: row.event_root_code,
      eventLabel: eventCodeLabel(row.event_code, row.event_root_code, row.event_base_code),
      channel: row.channel,
      quadClass,
      quadClassLabel: quadClassLabel(quadClass),
      actor1Name: row.actor1_name,
      actor2Name: row.actor2_name,
      goldsteinScale: numberOrNull(row.goldstein_scale),
      sourceUrl: row.source_url,
      sourceDomain: row.source_domain,
    };
  });
  return {
    events,
    status: {
      ok: true,
      message: events.length ? "地区事件时间线已更新" : "该地区当前日期暂无可追溯事件。",
      emptyReason: events.length ? undefined : "empty",
    } satisfies QueryStatus,
  };
}

export async function queryRegionTrend(
  regionKey: string,
  endDate?: string,
  days = 90,
  scoreVersion?: string,
): Promise<RegionTrend> {
  const pool = getPool();
  const dataEndDate = endDate ?? (await getDefaultDate());
  const boundedDays = Math.min(Math.max(Math.trunc(days), 7), 90);
  if (!dataEndDate) {
    return {
      regionKey,
      regionName: regionKey,
      days: boundedDays,
      startDate: null,
      endDate: null,
      scoreVersion: scoreVersion ?? null,
      mixedScoreVersions: false,
      hiddenVersionDays: 0,
      points: [],
    };
  }

  let targetScoreVersion = scoreVersion?.trim() || null;
  if (!targetScoreVersion) {
    const versionResult = await pool.query<{ score_version: string | null }>(
      `
        select score_version
        from map_region_daily_metrics
        where region_key = $1
          and data_date = $2::date
        limit 1
      `,
      [regionKey, dataEndDate],
    );
    targetScoreVersion = versionResult.rows[0]?.score_version ?? null;
  }

  const result = await pool.query<{
    data_date: string;
    region_name: string | null;
    primary_channel: string | null;
    channel_count: number | string | null;
    channel_breakdown: unknown;
    heat_score: number | string | null;
    heat_delta: number | string | null;
    trend_label: string | null;
    event_count: number | string | null;
    mention_count: number | string | null;
    source_count: number | string | null;
    weighted_goldstein: number | string | null;
    goldstein_min: number | string | null;
    goldstein_max: number | string | null;
    dominant_quad_class: number | string | null;
    quad_class_breakdown: unknown;
    baseline_mean: number | string | null;
    baseline_stddev: number | string | null;
    baseline_days: number | string | null;
    relative_heat_zscore: number | string | null;
    score_version: string | null;
    hidden_version_days: number | string | null;
    is_missing: boolean;
  }>(
    `
      with bounds as (
        select
          $2::date as end_date,
          ($2::date - (($3::int - 1) || ' days')::interval)::date as start_date
      ),
      days as (
        select generate_series(start_date, end_date, interval '1 day')::date as data_date
        from bounds
      ),
      raw_metrics as (
        select *
        from map_region_daily_metrics
        where region_key = $1
          and data_date between (select start_date from bounds) and (select end_date from bounds)
      ),
      filtered_metrics as (
        select *
        from raw_metrics
        where ($4::text is null or score_version = $4::text)
      ),
      hidden_version_days as (
        select count(distinct raw_metrics.data_date) as count
        from raw_metrics
        left join filtered_metrics
          on filtered_metrics.data_date = raw_metrics.data_date
        where filtered_metrics.data_date is null
      )
      select
        days.data_date::text,
        m.region_name,
        m.primary_channel,
        m.channel_count,
        m.channel_breakdown,
        m.heat_score,
        m.heat_delta,
        m.trend_label,
        m.event_count,
        m.mention_count,
        m.source_count,
        m.weighted_goldstein,
        m.goldstein_min,
        m.goldstein_max,
        m.dominant_quad_class,
        m.quad_class_breakdown,
        m.baseline_mean,
        m.baseline_stddev,
        m.baseline_days,
        m.relative_heat_zscore,
        m.score_version,
        m.region_key is null as is_missing,
        (select count from hidden_version_days) as hidden_version_days
      from days
      left join filtered_metrics m
        on m.data_date = days.data_date
      order by days.data_date asc
    `,
    [regionKey, dataEndDate, boundedDays, targetScoreVersion],
  );

  const regionName = result.rows.find((row) => row.region_name)?.region_name ?? regionKey;
  const hiddenVersionDays = numberValue(result.rows[0]?.hidden_version_days);
  const points = result.rows.map((row): RegionTrendPoint => {
    const dominantQuadClass = numberOrNull(row.dominant_quad_class);
    return {
      dataDate: row.data_date,
      isMissing: row.is_missing,
      heatScore: numberValue(row.heat_score),
      heatDelta: numberOrNull(row.heat_delta),
      trendLabel: row.trend_label || "基线不足",
      eventCount: numberValue(row.event_count),
      mentionCount: numberValue(row.mention_count),
      sourceCount: numberValue(row.source_count),
      weightedGoldstein: numberOrNull(row.weighted_goldstein),
      goldsteinMin: numberOrNull(row.goldstein_min),
      goldsteinMax: numberOrNull(row.goldstein_max),
      dominantQuadClass,
      quadClassLabel: quadClassLabel(dominantQuadClass),
      quadClassBreakdown: quadClassBreakdownArray(row.quad_class_breakdown),
      baselineMean: numberOrNull(row.baseline_mean),
      baselineStddev: numberOrNull(row.baseline_stddev),
      baselineDays: numberValue(row.baseline_days),
      relativeHeatZScore: numberOrNull(row.relative_heat_zscore),
      scoreVersion: row.score_version,
      channel: row.primary_channel,
      channelCount: numberValue(row.channel_count),
      channelBreakdown: channelBreakdownArray(row.channel_breakdown),
    };
  });

  return {
    regionKey,
    regionName,
    days: boundedDays,
    startDate: points[0]?.dataDate ?? null,
    endDate: points.at(-1)?.dataDate ?? null,
    scoreVersion: targetScoreVersion,
    mixedScoreVersions: hiddenVersionDays > 0,
    hiddenVersionDays,
    points,
  };
}

export async function getDailyBrief(date?: string): Promise<DailyBrief> {
  const pool = getPool();
  const dataDate = date ?? (await getDefaultDate());
  if (!dataDate) {
    return emptyBrief("暂无可展示数据。");
  }
  const [result, previousResult, status] = await Promise.all([
    pool.query<{
      data_date: string;
      hotspot_count: number | string;
      top_regions: Array<{ name: string; count: number }>;
      top_channels: Array<{ name: string; count: number }>;
      brief_text: string;
      data_updated_at: string;
    }>(
      `
        select data_date::text, hotspot_count, top_regions, top_channels, brief_text, data_updated_at::text
        from daily_briefs
        where data_date = $1::date
      `,
      [dataDate],
    ),
    pool.query<{ hotspot_count: number | string }>(
      `
        select hotspot_count
        from daily_briefs
        where data_date < $1::date
        order by data_date desc
        limit 1
      `,
      [dataDate],
    ),
    getDataStatus(),
  ]);
  const row = result.rows[0];
  if (!row) {
    return emptyBrief(`${dataDate} 暂无地图简报。`, dataDate);
  }
  return {
    dataDate: row.data_date,
    hotspotCount: Number(row.hotspot_count),
    hotspotDelta: previousResult.rows[0]
      ? Number(row.hotspot_count) - Number(previousResult.rows[0].hotspot_count)
      : null,
    topRegions: row.top_regions,
    topChannels: row.top_channels,
    freshnessText: `数据覆盖至 ${row.data_updated_at}`,
    completenessText: status.isComplete ? "本日数据导入完整。" : "最近一次导入未完整完成，热点可能不完整。",
    briefText: row.brief_text,
  };
}

function emptyBrief(text: string, dataDate: string | null = null): DailyBrief {
  return {
    dataDate,
    hotspotCount: 0,
    hotspotDelta: null,
    topRegions: [],
    topChannels: [],
    freshnessText: "暂无最近数据。",
    completenessText: "请先完成每日导入任务。",
    briefText: text,
  };
}

function databaseDownStatus(): DataStatus {
  return {
    databaseAvailable: false,
    currentDataDate: null,
    latestSuccessfulImportDate: null,
    eventsReady: false,
    mentionsReady: false,
    gkgReady: false,
    isComplete: false,
    message: "数据库不可用，请检查连接配置和服务状态。",
    latestImportBatch: null,
  };
}

export async function getDataStatus(): Promise<DataStatus> {
  try {
    const pool = getPool();
    const [dateResult, batchResult, latestBatchResult, gkgParameterResult] = await Promise.all([
      pool.query<{ data_date: string }>("select data_date::text from map_hotspots order by data_date desc limit 1"),
      pool.query<{
        import_date: string;
        status: string;
        events_status: string;
        mentions_status: string;
        gkg_status: string;
      }>(
        `
          select import_date::text, status, events_status, mentions_status, gkg_status
          from gdelt_import_batches
          where status in ('success', 'partial_success')
          order by import_date desc, started_at desc
          limit 1
        `,
      ),
      pool.query<{
        import_date: string;
        status: string;
        processing_status: string;
        events_status: string;
        mentions_status: string;
        gkg_status: string;
        files_attempted: number | string;
        files_imported: number | string;
        files_registered: number | string;
        files_finished: number | string;
        rows_inserted: number | string;
        started_at: string | null;
        finished_at: string | null;
        error_message: string | null;
      }>(
        `
          select
            b.import_date::text,
            b.status,
            b.processing_status,
            b.events_status,
            b.mentions_status,
            b.gkg_status,
            b.files_attempted,
            b.files_imported,
            coalesce(count(f.id), 0) as files_registered,
            coalesce(count(f.id) filter (where f.status in ('imported', 'skipped', 'failed')), 0) as files_finished,
            b.rows_inserted,
            b.started_at::text,
            b.finished_at::text,
            b.error_message
          from gdelt_import_batches b
          left join gdelt_import_files f on f.batch_id = b.id
          group by b.id
          order by b.import_date desc, b.started_at desc
          limit 1
        `,
      ),
      pool.query<{ value: string | null }>("select value from system_parameters where key = 'enable_gkg_loader'"),
    ]);
    const batch = batchResult.rows[0];
    const latestBatch = latestBatchResult.rows[0];
    const eventsReady = batch?.events_status === "success";
    const mentionsReady = batch?.mentions_status === "success";
    const gkgRequired = gkgParameterResult.rows[0]?.value?.toLowerCase() !== "false";
    const gkgReady = !gkgRequired || batch?.gkg_status === "success";
    const isComplete = Boolean(batch && batch.status === "success" && eventsReady && mentionsReady && gkgReady);
    const latestImportBatch = latestBatch
      ? {
          importDate: latestBatch.import_date,
          status: latestBatch.status,
          processingStatus: latestBatch.processing_status,
          eventsStatus: latestBatch.events_status,
          mentionsStatus: latestBatch.mentions_status,
          gkgStatus: latestBatch.gkg_status,
          filesAttempted: numberValue(latestBatch.files_attempted),
          filesImported: numberValue(latestBatch.files_imported),
          filesRegistered: numberValue(latestBatch.files_registered),
          filesFinished: numberValue(latestBatch.files_finished),
          rowsInserted: numberValue(latestBatch.rows_inserted),
          startedAt: latestBatch.started_at,
          finishedAt: latestBatch.finished_at,
          errorMessage: latestBatch.error_message,
        }
      : null;
    return {
      databaseAvailable: true,
      currentDataDate: dateResult.rows[0]?.data_date ?? null,
      latestSuccessfulImportDate: batch?.import_date ?? null,
      eventsReady,
      mentionsReady,
      gkgReady,
      isComplete,
      message: isComplete
        ? "数据已完整导入。"
        : dateResult.rows[0]?.data_date
          ? "数据可用，但最近一次导入可能不完整。"
          : latestImportBatch
            ? "数据库已连接，正在等待可展示热点生成。"
            : "数据库已连接，但还没有导入批次记录。",
      latestImportBatch,
    };
  } catch {
    return databaseDownStatus();
  }
}
