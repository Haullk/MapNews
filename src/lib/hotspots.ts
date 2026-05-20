import { getPool } from "./db";

export const CHANNELS = ["国际", "冲突", "政治", "经济", "灾害", "社会"] as const;
export type Channel = (typeof CHANNELS)[number];

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

export interface MapHotspot {
  id: number;
  regionName: string;
  lat: number;
  lng: number;
  channel: string;
  heatScore: number;
  eventCount: number;
  mentionCount: number;
  sourceCount: number;
  dataDate: string;
  summary: string;
}

export interface HotspotRankingItem extends MapHotspot {
  dataTime: string;
}

export interface HotspotSource {
  url: string;
  domain: string | null;
  title: string | null;
}

export interface HotspotDetail extends MapHotspot {
  articleCount: number;
  domainCount: number;
  updatedAt: string;
  representativeSources: HotspotSource[];
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

function hotspotFromRow(row: {
  id: number;
  region_name: string;
  centroid_lat: number | string;
  centroid_long: number | string;
  channel: string;
  heat_score: number | string;
  event_count: number | string;
  mention_count: number | string;
  source_count: number | string;
  data_date: string;
  summary: string;
}): MapHotspot {
  return {
    id: Number(row.id),
    regionName: row.region_name,
    lat: Number(row.centroid_lat),
    lng: Number(row.centroid_long),
    channel: row.channel,
    heatScore: Number(row.heat_score),
    eventCount: Number(row.event_count),
    mentionCount: Number(row.mention_count),
    sourceCount: Number(row.source_count),
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
    const [dates, status] = await Promise.all([
      pool.query<{ data_date: string }>("select distinct data_date::text from map_hotspots order by data_date desc limit 14"),
      getDataStatus(),
    ]);
    return {
      dates: dates.rows.map((row) => row.data_date),
      channels: CHANNELS,
      databaseReady: status.databaseAvailable,
      status,
    };
  } catch {
    return {
      dates: [],
      channels: CHANNELS,
      databaseReady: false,
      status: databaseDownStatus(),
    };
  }
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
      select id, region_name, centroid_lat, centroid_long, channel, heat_score,
             event_count, mention_count, source_count, data_date::text, summary
      from map_hotspots
      ${where.length ? `where ${where.join(" and ")}` : ""}
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

export async function queryHotspotRanking(filters: HotspotFilters): Promise<HotspotRankingItem[]> {
  const result = await queryMapHotspots({ ...filters, limit: filters.limit ?? 20, bbox: undefined });
  return result.hotspots.map((hotspot) => ({ ...hotspot, dataTime: hotspot.dataDate }));
}

export async function getHotspotDetail(id: number): Promise<HotspotDetail | null> {
  const pool = getPool();
  const [hotspotResult, sourceResult] = await Promise.all([
    pool.query<Parameters<typeof hotspotFromRow>[0] & {
      article_count: number | string;
      source_domain_count: number | string;
      data_updated_at: string;
    }>(
      `
        select id, region_name, centroid_lat, centroid_long, channel, heat_score,
               event_count, mention_count, article_count, source_count, source_domain_count,
               data_date::text, summary, data_updated_at::text
        from map_hotspots
        where id = $1
      `,
      [id],
    ),
    pool.query<{ source_url: string; source_domain: string | null; title: string | null }>(
      `
        select source_url, source_domain, title
        from map_hotspot_sources
        where hotspot_id = $1
        order by source_rank asc
        limit 8
      `,
      [id],
    ),
  ]);
  const row = hotspotResult.rows[0];
  if (!row) return null;
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
    freshnessText: `数据更新于 ${row.data_updated_at}`,
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
