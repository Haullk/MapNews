"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataStatus, DailyBrief, HotspotDetail, MapHotspot } from "@/lib/hotspots";

interface NewsMapProps {
  mapKey: string;
  mapSecurityCode: string;
  dates: string[];
  channels: readonly string[];
  databaseReady: boolean;
  initialStatus: DataStatus;
}

interface Filters {
  date: string;
  channel: string;
  region: string;
}

type HotspotsPayload = { hotspots: MapHotspot[]; status: { message: string; ok: boolean } };
type LoadMode = "full" | "hotspots" | "viewport";
type PanelView = "ranking" | "detail";
type EnrichmentState = {
  hotspotId: number;
  status: "running" | "success" | "error";
  message: string;
};

const GCJ_PI = Math.PI;
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

const CHANNEL_COLORS: Record<string, string> = {
  国际: "#0f8f7f",
  冲突: "#bc3f32",
  政治: "#4b6fb5",
  经济: "#b98221",
  灾害: "#7d4aa8",
  社会: "#52606d",
};

function isOutsideChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number) {
  let ret = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * GCJ_PI) + 20 * Math.sin(2 * lng * GCJ_PI)) * 2) / 3;
  ret += ((20 * Math.sin(lat * GCJ_PI) + 40 * Math.sin((lat / 3) * GCJ_PI)) * 2) / 3;
  ret += ((160 * Math.sin((lat / 12) * GCJ_PI) + 320 * Math.sin((lat * GCJ_PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(lng: number, lat: number) {
  let ret = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20 * Math.sin(6 * lng * GCJ_PI) + 20 * Math.sin(2 * lng * GCJ_PI)) * 2) / 3;
  ret += ((20 * Math.sin(lng * GCJ_PI) + 40 * Math.sin((lng / 3) * GCJ_PI)) * 2) / 3;
  ret += ((150 * Math.sin((lng / 12) * GCJ_PI) + 300 * Math.sin((lng / 30) * GCJ_PI)) * 2) / 3;
  return ret;
}

function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (isOutsideChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * GCJ_PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * GCJ_PI);
  dLng = (dLng * 180) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * GCJ_PI);
  return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (isOutsideChina(lng, lat)) return [lng, lat];
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
  return [lng * 2 - gcjLng, lat * 2 - gcjLat];
}

function hotspotNeedsEnrichment(hotspot: HotspotDetail) {
  const quality = hotspot.explanation.sourceQuality;
  return !quality.enhanced || hotspot.storyGroups.length === 0 || quality.candidateSourceCount === 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function NewsMap({ mapKey, mapSecurityCode, dates, channels, databaseReady, initialStatus }: NewsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markersRef = useRef<AMapMarker[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const preserveRankingUntilRef = useRef(0);
  const enrichmentPollRef = useRef<Map<number, boolean>>(new Map());
  const loadWorkspaceRef = useRef<(mode?: LoadMode) => void>(() => undefined);
  const briefCacheRef = useRef<Map<string, DailyBrief>>(new Map());
  const statusCacheRef = useRef<DataStatus | null>(initialStatus);
  const previousFiltersRef = useRef<Filters | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hotspots, setHotspots] = useState<MapHotspot[]>([]);
  const [ranking, setRanking] = useState<MapHotspot[]>([]);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [selected, setSelected] = useState<HotspotDetail | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<number | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("ranking");
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState | null>(null);
  const [zoomLevel, setZoomLevel] = useState(3);
  const [status, setStatus] = useState<DataStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ date: dates[0] ?? "", channel: "", region: "" });
  const canLoadMap = mapKey.trim().length > 0;
  const visibleHotspotLimit = zoomLevel <= 3 ? 120 : zoomLevel <= 4 ? 240 : hotspots.length;
  const visibleHotspots = useMemo(() => hotspots.slice(0, visibleHotspotLimit), [hotspots, visibleHotspotLimit]);
  const maxRankingHeat = Math.max(...ranking.map((item) => item.heatScore), 1);
  const selectedEnrichmentState =
    selected && enrichmentState?.hotspotId === selected.id ? enrichmentState : null;

  useEffect(() => {
    if (!canLoadMap || window.AMap) return;
    if (mapSecurityCode.trim()) {
      window._AMapSecurityConfig = { securityJsCode: mapSecurityCode.trim() };
    }
    window.initAmap = () => setMapReady(true);
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(mapKey)}&callback=initAmap`;
    script.async = true;
    script.onerror = () => setMessage("地图加载失败，请检查高德 Web 端 Key、服务平台和域名白名单。");
    document.head.appendChild(script);
    return () => {
      window.initAmap = undefined;
    };
  }, [canLoadMap, mapKey, mapSecurityCode]);

  useEffect(() => {
    if (window.AMap) setMapReady(true);
  }, []);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
  }, []);

  const queryParams = useCallback(
    (withBounds: boolean) => {
      const params = new URLSearchParams();
      if (filters.date) params.set("date", filters.date);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.region) params.set("region", filters.region);
      const map = mapRef.current;
      if (withBounds && map) {
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const [swLng, swLat] = gcj02ToWgs84(sw.getLng(), sw.getLat());
        const [neLng, neLat] = gcj02ToWgs84(ne.getLng(), ne.getLat());
        params.set("west", String(Math.min(swLng, neLng)));
        params.set("south", String(Math.min(swLat, neLat)));
        params.set("east", String(Math.max(swLng, neLng)));
        params.set("north", String(Math.max(swLat, neLat)));
      }
      return params;
    },
    [filters],
  );

  const briefParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.date) params.set("date", filters.date);
    return params;
  }, [filters.date]);

  const loadWorkspace = useCallback(async (mode: LoadMode = "full") => {
    if (!databaseReady) return;
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const hotspotResponse = await fetch(`/api/hotspots?${queryParams(Boolean(mapRef.current)).toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const hotspotPayload = (await hotspotResponse.json()) as HotspotsPayload;
      if (requestId !== requestIdRef.current) return;
      if (!hotspotResponse.ok) {
        throw new Error(hotspotPayload.status.message);
      }
      setHotspots(hotspotPayload.hotspots);
      if (mode !== "viewport") {
        setRanking(hotspotPayload.hotspots.slice(0, 20));
      }
      setMessage(hotspotPayload.status.message);

      if (mode === "hotspots" || mode === "viewport") return;

      const briefKey = filters.date || "__default__";
      const cachedBrief = briefCacheRef.current.get(briefKey);
      const cachedStatus = statusCacheRef.current;
      if (cachedBrief && cachedStatus) {
        setBrief(cachedBrief);
        setStatus(cachedStatus);
        return;
      }

      const briefRequest = cachedBrief
        ? Promise.resolve<{ brief: DailyBrief }>({ brief: cachedBrief })
        : fetch(`/api/daily-brief?${briefParams().toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          }).then((response) => response.json() as Promise<{ brief: DailyBrief }>);
      const statusRequest = cachedStatus
        ? Promise.resolve<{ status: DataStatus }>({ status: cachedStatus })
        : fetch("/api/data-status", {
            cache: "no-store",
            signal: controller.signal,
          }).then((response) => response.json() as Promise<{ status: DataStatus }>);
      const [briefPayload, statusPayload] = await Promise.all([briefRequest, statusRequest]);
      if (requestId !== requestIdRef.current) return;
      briefCacheRef.current.set(briefKey, briefPayload.brief);
      statusCacheRef.current = statusPayload.status;
      setBrief(briefPayload.brief);
      setStatus(statusPayload.status);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "热点数据加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [briefParams, databaseReady, filters.date, queryParams]);

  useEffect(() => {
    loadWorkspaceRef.current = loadWorkspace;
  }, [loadWorkspace]);

  const scheduleHotspotLoad = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const mode: LoadMode = Date.now() < preserveRankingUntilRef.current ? "viewport" : "hotspots";
      loadWorkspaceRef.current(mode);
    }, 350);
  }, []);

  const updateZoomLevel = useCallback(() => {
    if (mapRef.current) setZoomLevel(mapRef.current.getZoom());
  }, []);

  useEffect(() => {
    if (!mapReady || !mapEl.current || mapRef.current || !window.AMap) return;
    mapRef.current = new window.AMap.Map(mapEl.current, {
      center: [105, 30],
      zoom: 3,
      viewMode: "2D",
      mapStyle: "amap://styles/normal",
    });
    window.__mapnewsMap = mapRef.current;
    setZoomLevel(mapRef.current.getZoom());
    mapRef.current.on("complete", () => {
      updateZoomLevel();
      loadWorkspaceRef.current("full");
    });
    mapRef.current.on("moveend", () => {
      updateZoomLevel();
      scheduleHotspotLoad();
    });
    mapRef.current.on("zoomend", () => {
      updateZoomLevel();
      scheduleHotspotLoad();
    });
    loadWorkspace("full");
  }, [loadWorkspace, mapReady, scheduleHotspotLoad, updateZoomLevel]);

  useEffect(() => {
    if (!databaseReady) return;
    const previousFilters = previousFiltersRef.current;
    previousFiltersRef.current = filters;
    if (!previousFilters) return;
    const mode: LoadMode = previousFilters.date === filters.date ? "hotspots" : "full";
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      loadWorkspace(mode);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [databaseReady, filters, loadWorkspace]);

  useEffect(() => {
    if (!mapRef.current || !window.AMap) return;
    clearMarkers();
    markersRef.current = visibleHotspots.map((hotspot) => {
      const color = CHANNEL_COLORS[hotspot.channel] ?? "#0f8f7f";
      const size = Math.round(Math.min(36, Math.max(22, 18 + Math.log10(hotspot.heatScore + 1) * 4)));
      const position = wgs84ToGcj02(hotspot.lng, hotspot.lat);
      const marker = new window.AMap!.Marker({
        map: mapRef.current!,
        position,
        title: hotspot.summary,
        content: `<span class="hotspot-marker" style="--marker-color: ${color}; --marker-size: ${size}px">${hotspot.channel.slice(0, 1)}</span>`,
      });
      marker.on("click", () => openHotspot(hotspot.id));
      return marker;
    });
    return clearMarkers;
  }, [clearMarkers, visibleHotspots]);

  async function fetchHotspotDetail(id: number) {
    const response = await fetch(`/api/hotspots/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as { hotspot?: HotspotDetail };
    return payload.hotspot ?? null;
  }

  async function refreshHotspotIfCurrent(id: number) {
    const hotspot = await fetchHotspotDetail(id);
    if (!hotspot) return null;
    setSelected((current) => (current?.id === id ? hotspot : current));
    setExpandedStoryId((current) => current ?? hotspot.storyGroups[0]?.id ?? null);
    return hotspot;
  }

  async function triggerHotspotEnrichment(id: number) {
    if (enrichmentPollRef.current.get(id)) return;
    enrichmentPollRef.current.set(id, true);
    setEnrichmentState({
      hotspotId: id,
      status: "running",
      message: "正在补充来源元数据、故事组和主题实体。",
    });
    try {
      const response = await fetch(`/api/hotspots/${id}/enrich`, { cache: "no-store", method: "POST" });
      const payload = (await response.json()) as { status?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "来源增强任务启动失败。");
      }
      if (payload.status === "ready") {
        const hotspot = await refreshHotspotIfCurrent(id);
        if (hotspot && !hotspotNeedsEnrichment(hotspot)) {
          setEnrichmentState({ hotspotId: id, status: "success", message: "来源增强已完成。" });
        }
        return;
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(attempt < 8 ? 1000 : 2000);
        const hotspot = await refreshHotspotIfCurrent(id);
        if (hotspot && !hotspotNeedsEnrichment(hotspot)) {
          setEnrichmentState({ hotspotId: id, status: "success", message: "来源增强已完成。" });
          return;
        }
      }

      setEnrichmentState({
        hotspotId: id,
        status: "running",
        message: "来源增强还在后台处理，稍后会自动补齐或再次点开刷新。",
      });
    } catch (error) {
      setEnrichmentState({
        hotspotId: id,
        status: "error",
        message: error instanceof Error ? error.message : "来源增强任务启动失败。",
      });
    } finally {
      enrichmentPollRef.current.set(id, false);
    }
  }

  async function openHotspot(id: number) {
    const hotspot = await fetchHotspotDetail(id);
    setSelected(hotspot);
    setExpandedStoryId(hotspot?.storyGroups[0]?.id ?? null);
    if (hotspot) {
      setPanelView("detail");
      if (hotspotNeedsEnrichment(hotspot)) {
        void triggerHotspotEnrichment(id);
      } else {
        setEnrichmentState(null);
      }
    }
  }

  function locateRankingItem(item: MapHotspot) {
    preserveRankingUntilRef.current = Date.now() + 1200;
    mapRef.current?.setZoomAndCenter(6, wgs84ToGcj02(item.lng, item.lat));
    setZoomLevel(6);
    setPanelView("detail");
    openHotspot(item.id);
  }

  function searchRegion() {
    if (!filters.region.trim()) return;
    loadWorkspace("hotspots");
  }

  function flagText(flag: string) {
    const labels: Record<string, string> = {
      same_title_repost: "同源转载",
      old_article: "旧文风险",
      missing_title: "缺少标题",
      missing_published_at: "缺发布时间",
      fetch_failed: "抓取失败",
      metadata_not_fetched: "未抓取元数据",
      gkg_missing: "主题缺失",
    };
    return labels[flag] ?? flag;
  }

  return (
    <section className="map-workspace">
      <aside className="control-panel" aria-label="地图新闻工作台">
        <div className="sidebar-section">
          <p className="eyebrow">今日地图简报</p>
          <p className="brief-text">{brief?.briefText ?? "正在读取今日地图简报。"}</p>
          <div className="status-note">{brief?.completenessText ?? status.message}</div>
        </div>

        <div className="sidebar-section filters-grid">
          <label>
            日期
            <select value={filters.date} onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}>
              <option value="">最近可用</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <label>
            频道
            <select
              value={filters.channel}
              onChange={(event) => setFilters((prev) => ({ ...prev, channel: event.target.value }))}
            >
              <option value="">全部频道</option>
              {channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          <label className="region-search">
            地区搜索
            <span className="search-row">
              <input
                value={filters.region}
                onChange={(event) => setFilters((prev) => ({ ...prev, region: event.target.value }))}
                placeholder="国家、城市或地区"
              />
              <button type="button" onClick={searchRegion}>
                搜索
              </button>
            </span>
          </label>
        </div>

        <div className="stats-grid">
          <div className="stat-cell">
            <span>热点</span>
            <strong>{hotspots.length}</strong>
          </div>
          <div className="stat-cell">
            <span>当前日期</span>
            <strong>{status.currentDataDate ?? filters.date ?? "暂无"}</strong>
          </div>
          <div className="stat-cell">
            <span>导入状态</span>
            <strong>{status.isComplete ? "完整" : "待确认"}</strong>
          </div>
        </div>

        <div className="panel-tabs" role="tablist" aria-label="侧栏视图">
          <button
            type="button"
            className={panelView === "ranking" ? "active" : ""}
            onClick={() => setPanelView("ranking")}
          >
            热点排行
          </button>
          <button
            type="button"
            className={panelView === "detail" ? "active" : ""}
            disabled={!selected}
            onClick={() => setPanelView("detail")}
          >
            热点详情
          </button>
        </div>

        {panelView === "ranking" ? (
          <div className="sidebar-section">
            <div className="section-heading">
              <p className="eyebrow">热点排行</p>
              <span>
                地图显示 {visibleHotspots.length}/{hotspots.length}
              </span>
            </div>
            <div className="ranking-list">
              {ranking.map((item) => (
                <button key={item.id} type="button" className="ranking-item" onClick={() => locateRankingItem(item)}>
                  <span>{item.regionName}</span>
                  <strong>{item.channel}</strong>
                  <small>
                    {item.eventCount} 个事件 · {item.sourceCount} 个来源
                  </small>
                  <i className="heat-bar">
                    <b style={{ width: `${Math.max(8, Math.round((item.heatScore / maxRankingHeat) * 100))}%` }} />
                  </i>
                </button>
              ))}
              {ranking.length === 0 ? <div className="empty-detail">当前筛选下暂无热点排行。</div> : null}
            </div>
          </div>
        ) : selected ? (
          <article className="detail-panel">
            <div className="detail-hero">
              <p className="eyebrow">热点详情</p>
              <h2>{selected.explanation.title}</h2>
              <p className="detail-summary">{selected.explanation.whatHappened}</p>
              <div className="detail-metrics">
                <span>{selected.sourceCount} 个来源</span>
                <span>分析 {selected.explanation.sourceQuality.candidateSourceCount} 个候选</span>
                <span>读取 {selected.explanation.sourceQuality.fetchedSourceCount} 个代表来源</span>
                <span>去重 {selected.explanation.sourceQuality.storyCount} 个故事</span>
                <span>{selected.domainCount} 个域名</span>
              </div>
            </div>
            {hotspotNeedsEnrichment(selected) || selectedEnrichmentState ? (
              <div className={`enrichment-banner ${selectedEnrichmentState?.status ?? "running"}`}>
                <strong>
                  {selectedEnrichmentState?.status === "error"
                    ? "来源增强失败"
                    : selectedEnrichmentState?.status === "success"
                      ? "来源增强完成"
                      : "正在补充来源信息"}
                </strong>
                <span>
                  {selectedEnrichmentState?.message ??
                    "正在抓取代表来源元数据，并生成故事组、主题和参与方信息。"}
                </span>
              </div>
            ) : null}
            <dl>
              <div>
                <dt>地区</dt>
                <dd>{selected.regionName}</dd>
              </div>
              <div>
                <dt>频道</dt>
                <dd>{selected.channel}</dd>
              </div>
              <div>
                <dt>热度</dt>
                <dd>{selected.heatScore.toFixed(1)}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>
                  {selected.sourceCount} 个来源，{selected.domainCount} 个域名
                </dd>
              </div>
            </dl>

            <section className="detail-section">
              <p className="eyebrow">为什么热</p>
              <ul className="compact-list">
                {selected.explanation.importanceReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </section>

            <section className="detail-section">
              <p className="eyebrow">主题与参与方</p>
              <div className="tag-cloud">
                {selected.explanation.topics.slice(0, 8).map((topic) => (
                  <span key={topic.name}>{topic.name}</span>
                ))}
                {selected.explanation.entities.slice(0, 8).map((entity) => (
                  <span key={`${entity.type ?? "entity"}-${entity.name}`}>{entity.name}</span>
                ))}
                {selected.explanation.topics.length === 0 && selected.explanation.entities.length === 0 ? (
                  <span>暂无主题实体数据</span>
                ) : null}
              </div>
            </section>

            <section className="detail-section">
              <p className="eyebrow">热点内故事组</p>
              <div className="story-list">
                {selected.storyGroups.map((story) => {
                  const expanded = expandedStoryId === story.id;
                  return (
                    <div key={story.id} className="story-card">
                      <button type="button" className="story-card-toggle" onClick={() => setExpandedStoryId(expanded ? null : story.id)}>
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
                    {selectedEnrichmentState?.message ?? "当前仅有结构化事件数据，来源元数据和故事组仍在补充。"}
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
        ) : (
          <div className="empty-detail">点击地图热点或排行项查看基础详情。</div>
        )}
      </aside>

      <div className="map-stage">
        {canLoadMap ? <div ref={mapEl} className="map-canvas" /> : <div className="map-placeholder">请配置高德地图 Key。</div>}
        <div className="map-overlay">
          {loading
            ? "正在加载热点..."
            : `${message ?? status.message} · 当前地图显示 ${visibleHotspots.length}/${hotspots.length} 个热点`}
        </div>
      </div>
    </section>
  );
}
