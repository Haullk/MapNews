import { getPool } from "./db";

export const CHANNELS = ["国际", "冲突", "政治", "经济", "灾害", "社会"] as const;
export type Channel = (typeof CHANNELS)[number];
const DEFAULT_CHANNELS: readonly string[] = CHANNELS;

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

function numberValue(value: unknown) {
  return value === null || value === undefined ? 0 : Number(value);
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
}): MapHotspot {
  const id = Number(row.id);
  const heatScore = Number(row.heat_score);
  const eventCount = Number(row.event_count);
  const mentionCount = Number(row.mention_count);
  const sourceCount = Number(row.source_count);
  const primaryHotspotId = Number(row.primary_hotspot_id ?? row.id);
  const channelBreakdown = channelBreakdownArray(row.channel_breakdown);
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
              summary: row.summary,
            },
          ],
    heatScore,
    eventCount,
    mentionCount,
    sourceCount,
    dataDate: row.data_date,
    summary: row.summary,
  };
}

export async function getDefaultDate(): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query<{ data_date: string }>(
    "select data_date::text from map_hotspots order by data_date desc limit 1",
  );
  return result.rows[0]?.data_date ?? null;
}

export async function getInitialWorkspaceData() {
  try {
    const pool = getPool();
    const [dates, channels, status] = await Promise.all([
      pool.query<{ data_date: string }>("select distinct data_date::text from map_hotspots order by data_date desc limit 14"),
      getAvailableChannels(),
      getDataStatus(),
    ]);
    return {
      dates: dates.rows.map((row) => row.data_date),
      channels,
      databaseReady: status.databaseAvailable,
      status,
    };
  } catch {
    return {
      dates: [],
      channels: DEFAULT_CHANNELS,
      databaseReady: false,
      status: databaseDownStatus(),
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
             channel_count, channel_breakdown,
             concat(
               data_date::text, '，', region_name, '出现地区综合热点，主频道为', channel,
               '，包含 ', event_count, ' 个事件、', mention_count,
               ' 次相关报道提及，覆盖 ', channel_count, ' 个频道。'
             ) as summary
      from grouped
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
      message: hotspots.length ? "热点数据已更新" : "当前区域暂无热点，可调整地图范围或频道筛选。",
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
               data_date::text, summary, data_updated_at::text
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
        importanceReasons: ["当前热点主要依据事件数量、报道提及和来源数量进入地图展示。"],
        sourceQuality: { ...sourceQuality(null, fallbackQuality), enhanced: false },
        uncertaintyWarnings: ["当前仅有结构化事件数据，正在补充来源元数据和故事组。"],
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
    const [dateResult, batchResult] = await Promise.all([
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
    ]);
    const batch = batchResult.rows[0];
    const eventsReady = batch?.events_status === "success";
    const mentionsReady = batch?.mentions_status === "success";
    const gkgReady = batch?.gkg_status === "success";
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
