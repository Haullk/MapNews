"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
type LoadMode = "full" | "hotspots";

const CHANNEL_COLORS: Record<string, string> = {
  国际: "#0f8f7f",
  冲突: "#bc3f32",
  政治: "#4b6fb5",
  经济: "#b98221",
  灾害: "#7d4aa8",
  社会: "#52606d",
};

export function NewsMap({ mapKey, mapSecurityCode, dates, channels, databaseReady, initialStatus }: NewsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markersRef = useRef<AMapMarker[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const loadWorkspaceRef = useRef<(mode?: LoadMode) => void>(() => undefined);
  const briefCacheRef = useRef<Map<string, DailyBrief>>(new Map());
  const statusCacheRef = useRef<DataStatus | null>(initialStatus);
  const previousFiltersRef = useRef<Filters | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hotspots, setHotspots] = useState<MapHotspot[]>([]);
  const [ranking, setRanking] = useState<MapHotspot[]>([]);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [selected, setSelected] = useState<HotspotDetail | null>(null);
  const [status, setStatus] = useState<DataStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ date: dates[0] ?? "", channel: "", region: "" });
  const canLoadMap = mapKey.trim().length > 0;

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
        params.set("west", String(sw.getLng()));
        params.set("south", String(sw.getLat()));
        params.set("east", String(ne.getLng()));
        params.set("north", String(ne.getLat()));
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
      setRanking(hotspotPayload.hotspots.slice(0, 20));
      setMessage(hotspotPayload.status.message);

      if (mode === "hotspots") return;

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
      loadWorkspaceRef.current("hotspots");
    }, 350);
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
    mapRef.current.on("complete", () => loadWorkspaceRef.current("full"));
    mapRef.current.on("moveend", scheduleHotspotLoad);
    mapRef.current.on("zoomend", scheduleHotspotLoad);
    loadWorkspace("full");
  }, [loadWorkspace, mapReady, scheduleHotspotLoad]);

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
    markersRef.current = hotspots.map((hotspot) => {
      const color = CHANNEL_COLORS[hotspot.channel] ?? "#0f8f7f";
      const marker = new window.AMap!.Marker({
        map: mapRef.current!,
        position: [hotspot.lng, hotspot.lat],
        title: hotspot.summary,
        content: `<span class="hotspot-marker" style="--marker-color: ${color}">${hotspot.channel.slice(0, 1)}</span>`,
      });
      marker.on("click", () => openHotspot(hotspot.id));
      return marker;
    });
    return clearMarkers;
  }, [clearMarkers, hotspots]);

  async function openHotspot(id: number) {
    const response = await fetch(`/api/hotspots/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as { hotspot?: HotspotDetail };
    setSelected(payload.hotspot ?? null);
  }

  function locateRankingItem(item: MapHotspot) {
    mapRef.current?.setZoomAndCenter(6, [item.lng, item.lat]);
    openHotspot(item.id);
  }

  function searchRegion() {
    if (!filters.region.trim()) return;
    loadWorkspace("hotspots");
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

        <div className="sidebar-section">
          <p className="eyebrow">热点排行</p>
          <div className="ranking-list">
            {ranking.map((item) => (
              <button key={item.id} type="button" className="ranking-item" onClick={() => locateRankingItem(item)}>
                <span>{item.regionName}</span>
                <strong>{item.channel}</strong>
                <small>
                  {item.eventCount} 个事件 · {item.sourceCount} 个来源
                </small>
              </button>
            ))}
            {ranking.length === 0 ? <div className="empty-detail">当前筛选下暂无热点排行。</div> : null}
          </div>
        </div>

        {selected ? (
          <article className="detail-panel">
            <p className="eyebrow">热点详情</p>
            <h2>{selected.summary}</h2>
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
            <div className="source-list">
              {selected.representativeSources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.domain ?? source.url}
                </a>
              ))}
            </div>
          </article>
        ) : (
          <div className="empty-detail">点击地图热点或排行项查看基础详情。</div>
        )}
      </aside>

      <div className="map-stage">
        {canLoadMap ? <div ref={mapEl} className="map-canvas" /> : <div className="map-placeholder">请配置高德地图 Key。</div>}
        <div className="map-overlay">{loading ? "正在加载热点..." : message ?? status.message}</div>
      </div>
    </section>
  );
}
