import { getPool } from "./db";

export interface EventFilters {
  date?: string;
  eventCode?: string;
  country?: string;
  bbox?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  zoom?: number;
}

export interface MapEvent {
  id: number;
  lat: number;
  lng: number;
  title: string;
  eventCode: string;
  actionGeoName: string;
  eventDate: string;
  sourceUrl: string;
  articleCount: number;
  avgTone: number | null;
}

export interface EventDetail extends MapEvent {
  actor1Name: string | null;
  actor2Name: string | null;
  quadClass: number | null;
  goldsteinScale: number | null;
  summary: string;
}

const EVENT_CODE_LABELS: Record<string, string> = {
  "01": "发表声明",
  "02": "呼吁",
  "03": "表达合作意愿",
  "04": "磋商",
  "05": "外交合作",
  "06": "物质合作",
  "07": "提供援助",
  "08": "让步",
  "09": "调查",
  "10": "要求",
  "11": "反对",
  "12": "拒绝",
  "13": "威胁",
  "14": "抗议",
  "15": "展示军事姿态",
  "16": "削减关系",
  "17": "胁迫",
  "18": "攻击",
  "19": "战斗",
  "20": "非常规暴力",
};

export function eventCodeLabel(code: string | null | undefined) {
  if (!code) {
    return "未知事件";
  }

  return EVENT_CODE_LABELS[code.slice(0, 2)] ?? `事件 ${code}`;
}

export function buildEventSummary(event: {
  actor1Name: string | null;
  actor2Name: string | null;
  eventCode: string;
  actionGeoName: string;
  eventDate: string;
}) {
  const actors = [event.actor1Name, event.actor2Name].filter(Boolean).join(" 与 ");
  const actorText = actors || "相关主体";
  return `${event.eventDate}，${actorText}在${event.actionGeoName || "未知地点"}发生“${eventCodeLabel(
    event.eventCode,
  )}”相关事件。`;
}

export async function getInitialFilters() {
  try {
    const pool = getPool();
    const [dateResult, codeResult, countryResult] = await Promise.all([
      pool.query<{ event_date: string }>(
        "select distinct event_date::text from gdelt_events order by event_date desc limit 14",
      ),
      pool.query<{ event_code: string }>(
        "select distinct event_code from gdelt_events where event_code is not null order by event_code limit 80",
      ),
      pool.query<{ action_geo_country_code: string }>(
        "select distinct action_geo_country_code from gdelt_events where action_geo_country_code is not null order by action_geo_country_code limit 120",
      ),
    ]);

    return {
      dates: dateResult.rows.map((row) => row.event_date),
      eventCodes: codeResult.rows.map((row) => ({
        value: row.event_code,
        label: eventCodeLabel(row.event_code),
      })),
      countries: countryResult.rows.map((row) => row.action_geo_country_code),
      databaseReady: true,
    };
  } catch {
    return {
      dates: [],
      eventCodes: [],
      countries: [],
      databaseReady: false,
    };
  }
}

export async function queryMapEvents(filters: EventFilters): Promise<MapEvent[]> {
  const pool = getPool();
  const where: string[] = ["action_geo_lat is not null", "action_geo_long is not null"];
  const params: Array<string | number> = [];

  if (filters.date) {
    params.push(filters.date);
    where.push(`event_date = $${params.length}::date`);
  }

  if (filters.eventCode) {
    params.push(`${filters.eventCode}%`);
    where.push(`event_code like $${params.length}`);
  }

  if (filters.country) {
    params.push(filters.country);
    where.push(`action_geo_country_code = $${params.length}`);
  }

  if (filters.bbox) {
    params.push(filters.bbox.west, filters.bbox.south, filters.bbox.east, filters.bbox.north);
    where.push(
      `geom && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`,
    );
  }

  const limit = Math.min(Math.max((filters.zoom ?? 3) * 80, 200), 1200);
  params.push(limit);

  const result = await pool.query<{
    global_event_id: number;
    action_geo_lat: number;
    action_geo_long: number;
    event_code: string;
    action_geo_fullname: string;
    event_date: string;
    source_url: string;
    num_articles: number;
    avg_tone: number | null;
    actor1_name: string | null;
    actor2_name: string | null;
  }>(
    `
      select
        global_event_id,
        action_geo_lat,
        action_geo_long,
        event_code,
        coalesce(action_geo_fullname, '') as action_geo_fullname,
        event_date::text,
        coalesce(source_url, '') as source_url,
        coalesce(num_articles, 0) as num_articles,
        avg_tone,
        actor1_name,
        actor2_name
      from gdelt_events
      where ${where.join(" and ")}
      order by event_date desc, num_articles desc nulls last, global_event_id desc
      limit $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: row.global_event_id,
    lat: Number(row.action_geo_lat),
    lng: Number(row.action_geo_long),
    title: buildEventSummary({
      actor1Name: row.actor1_name,
      actor2Name: row.actor2_name,
      eventCode: row.event_code,
      actionGeoName: row.action_geo_fullname,
      eventDate: row.event_date,
    }),
    eventCode: row.event_code,
    actionGeoName: row.action_geo_fullname,
    eventDate: row.event_date,
    sourceUrl: row.source_url,
    articleCount: row.num_articles,
    avgTone: row.avg_tone === null ? null : Number(row.avg_tone),
  }));
}

export async function getEventDetail(id: number): Promise<EventDetail | null> {
  const pool = getPool();
  const result = await pool.query<{
    global_event_id: number;
    action_geo_lat: number;
    action_geo_long: number;
    event_code: string;
    action_geo_fullname: string;
    event_date: string;
    source_url: string;
    num_articles: number;
    avg_tone: number | null;
    actor1_name: string | null;
    actor2_name: string | null;
    quad_class: number | null;
    goldstein_scale: number | null;
  }>(
    `
      select
        global_event_id,
        action_geo_lat,
        action_geo_long,
        event_code,
        coalesce(action_geo_fullname, '') as action_geo_fullname,
        event_date::text,
        coalesce(source_url, '') as source_url,
        coalesce(num_articles, 0) as num_articles,
        avg_tone,
        actor1_name,
        actor2_name,
        quad_class,
        goldstein_scale
      from gdelt_events
      where global_event_id = $1
      limit 1
    `,
    [id],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const base = {
    id: row.global_event_id,
    lat: Number(row.action_geo_lat),
    lng: Number(row.action_geo_long),
    eventCode: row.event_code,
    actionGeoName: row.action_geo_fullname,
    eventDate: row.event_date,
    sourceUrl: row.source_url,
    articleCount: row.num_articles,
    avgTone: row.avg_tone === null ? null : Number(row.avg_tone),
    actor1Name: row.actor1_name,
    actor2Name: row.actor2_name,
    quadClass: row.quad_class,
    goldsteinScale: row.goldstein_scale === null ? null : Number(row.goldstein_scale),
  };

  const summary = buildEventSummary({
    actor1Name: base.actor1Name,
    actor2Name: base.actor2Name,
    eventCode: base.eventCode,
    actionGeoName: base.actionGeoName,
    eventDate: base.eventDate,
  });

  return {
    ...base,
    title: summary,
    summary,
  };
}
