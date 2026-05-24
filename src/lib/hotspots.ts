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
  region?: string;
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
  topRegions: Array<{ name: string; count: number }>;
  topChannels: Array<{ name: string; count: number }>;
  freshnessText: string;
  completenessText: string;
  briefText: string;
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
}

export interface InitialWorkspaceData {
  dates: string[];
  channels: readonly string[];
  databaseReady: boolean;
  status: DataStatus;
  initialHotspots: MapHotspot[];
  initialHotspotStatus: QueryStatus;
  initialBrief: DailyBrief | null;
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
  points: RegionTrendPoint[];
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
    .replace("主频道为", "主主题为")
    .replace(`主主题为${row.channel}`, `主主题为${themeLabel(row.channel)}`)
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
    trendLabel: row.trend_label || "暂无对比",
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
    const [dates, channels, status, hotspotResult, initialBrief] = await Promise.all([
      pool.query<{ data_date: string }>("select distinct data_date::text from map_hotspots order by data_date desc limit 90"),
      getAvailableChannels(),
      getDataStatus(),
      queryMapHotspots({ limit: 500 }),
      getDailyBrief(),
    ]);
    return {
      dates: dates.rows.map((row) => row.data_date),
      channels,
      databaseReady: status.databaseAvailable,
      status,
      initialHotspots: hotspotResult.hotspots,
      initialHotspotStatus: hotspotResult.status,
      initialBrief,
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
      initialBrief: null,
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

function applyFilters(filters: HotspotFilters, params: Array<string | number>, where: string[]) {
  if (filters.date) {
    params.push(filters.date);
    where.push(`data_date = $${params.length}::date`);
  }
  if (filters.channel) {
    params.push(filters.channel);
    where.push(`channel = $${params.length}`);
  }
  if (filters.region) {
    params.push(`%${filters.region}%`);
    where.push(`region_name ilike $${params.length}`);
  }
  if (filters.bbox) {
    params.push(filters.bbox.west, filters.bbox.south, filters.bbox.east, filters.bbox.north);
    where.push(
      `geom && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`,
    );
  }
}

export async function queryMapHotspots(filters: HotspotFilters) {
  const pool = getPool();
  const where: string[] = [];
  const params: Array<string | number> = [];
  const date = filters.date ?? (await getDefaultDate());
  applyFilters({ ...filters, date: date ?? undefined }, params, where);
  params.push(Math.min(Math.max(filters.limit ?? 500, 50), 1200));

  const result = await pool.query<
    Parameters<typeof hotspotFromRow>[0]
  >(
    `
      with filtered as (
        select *
        from map_hotspots
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
          sum(weighted_goldstein * greatest(event_count, 1))
            / nullif(sum(case when weighted_goldstein is not null then greatest(event_count, 1) else 0 end), 0) as weighted_goldstein,
          min(goldstein_min) as goldstein_min,
          max(goldstein_max) as goldstein_max,
          sum(heat_delta) filter (where heat_delta is not null) as heat_delta,
          count(heat_delta) as heat_delta_count,
          count(*) as channel_count,
          jsonb_agg(
            jsonb_build_object(
              'hotspotId', id,
              'channel', channel,
              'heatScore', heat_score,
              'eventCount', event_count,
              'mentionCount', mention_count,
              'sourceCount', source_count,
              'summary', summary
            )
            order by heat_score desc, event_count desc, id asc
          ) as channel_breakdown
        from filtered
        group by data_date, region_key
      )
      select id, primary_hotspot_id, data_date::text, region_key, region_name, channel,
             centroid_lat, centroid_long, heat_score, event_count, mention_count, source_count,
             channel_count, channel_breakdown, qs.dominant_quad_class, qs.quad_class_breakdown,
             weighted_goldstein, goldstein_min, goldstein_max, heat_delta,
             case
               when heat_delta_count = 0 then '暂无对比'
               when heat_delta >= greatest(10, (heat_score - heat_delta) * 0.15) then '升温'
               when heat_delta <= -greatest(10, (heat_score - heat_delta) * 0.15) then '冷却'
               else '活跃'
             end as trend_label,
             coalesce(actor_summary.top_actors, '[]'::jsonb) as top_actors,
             concat(
               data_date::text, '，', region_name, '出现地区综合热点，主主题为', channel,
               '，包含 ', event_count, ' 个事件、', mention_count,
               ' 次相关报道提及，覆盖 ', channel_count, ' 个主题。'
             ) as summary
      from grouped
      left join quad_summary qs using (data_date, region_key)
      left join actor_summary using (data_date, region_key)
      order by heat_score desc, event_count desc
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
               top_actors, data_updated_at::text
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
        importanceReasons: ["当前态势热点主要依据事件数量、报道提及和来源数量进入地图展示。"],
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

export async function queryRegionTrend(regionKey: string, endDate?: string, days = 90): Promise<RegionTrend> {
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
      points: [],
    };
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
        m.region_key is null as is_missing
      from days
      left join map_region_daily_metrics m
        on m.data_date = days.data_date
       and m.region_key = $1
      order by days.data_date asc
    `,
    [regionKey, dataEndDate, boundedDays],
  );

  const regionName = result.rows.find((row) => row.region_name)?.region_name ?? regionKey;
  const points = result.rows.map((row): RegionTrendPoint => {
    const dominantQuadClass = numberOrNull(row.dominant_quad_class);
    return {
      dataDate: row.data_date,
      isMissing: row.is_missing,
      heatScore: numberValue(row.heat_score),
      heatDelta: numberOrNull(row.heat_delta),
      trendLabel: row.trend_label || "暂无对比",
      eventCount: numberValue(row.event_count),
      mentionCount: numberValue(row.mention_count),
      sourceCount: numberValue(row.source_count),
      weightedGoldstein: numberOrNull(row.weighted_goldstein),
      goldsteinMin: numberOrNull(row.goldstein_min),
      goldsteinMax: numberOrNull(row.goldstein_max),
      dominantQuadClass,
      quadClassLabel: quadClassLabel(dominantQuadClass),
      quadClassBreakdown: quadClassBreakdownArray(row.quad_class_breakdown),
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
    points,
  };
}

export async function getDailyBrief(date?: string): Promise<DailyBrief> {
  const pool = getPool();
  const dataDate = date ?? (await getDefaultDate());
  if (!dataDate) {
    return emptyBrief("暂无可展示数据。");
  }
  const result = await pool.query<{
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
  );
  const row = result.rows[0];
  if (!row) {
    return emptyBrief(`${dataDate} 暂无地图简报。`, dataDate);
  }
  const status = await getDataStatus();
  return {
    dataDate: row.data_date,
    hotspotCount: Number(row.hotspot_count),
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
  };
}

export async function getDataStatus(): Promise<DataStatus> {
  try {
    const pool = getPool();
    const [dateResult, batchResult, gkgParameterResult] = await Promise.all([
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
      pool.query<{ value: string | null }>("select value from system_parameters where key = 'enable_gkg_loader'"),
    ]);
    const batch = batchResult.rows[0];
    const eventsReady = batch?.events_status === "success";
    const mentionsReady = batch?.mentions_status === "success";
    const gkgRequired = gkgParameterResult.rows[0]?.value?.toLowerCase() !== "false";
    const gkgReady = !gkgRequired || batch?.gkg_status === "success";
    const isComplete = Boolean(batch && batch.status === "success" && eventsReady && mentionsReady && gkgReady);
    return {
      databaseAvailable: true,
      currentDataDate: dateResult.rows[0]?.data_date ?? null,
      latestSuccessfulImportDate: batch?.import_date ?? null,
      eventsReady,
      mentionsReady,
      gkgReady,
      isComplete,
      message: isComplete ? "数据已完整导入。" : "数据可用，但最近一次导入可能不完整。",
    };
  } catch {
    return databaseDownStatus();
  }
}
