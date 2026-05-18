"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDetail, MapEvent } from "@/lib/events";

interface NewsMapProps {
  mapKey: string;
  mapSecurityCode: string;
  dates: string[];
  eventCodes: Array<{ value: string; label: string }>;
  countries: string[];
  databaseReady: boolean;
}

interface Filters {
  date: string;
  eventCode: string;
  country: string;
}

export function NewsMap({ mapKey, mapSecurityCode, dates, eventCodes, countries, databaseReady }: NewsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markersRef = useRef<AMapMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<MapEvent[]>([]);
  const [selected, setSelected] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    date: dates[0] ?? "",
    eventCode: "",
    country: "",
  });

  const canLoadMap = mapKey.trim().length > 0;

  useEffect(() => {
    if (!canLoadMap || window.AMap) {
      return;
    }

    if (mapSecurityCode.trim()) {
      window._AMapSecurityConfig = {
        securityJsCode: mapSecurityCode.trim(),
      };
    }

    window.initAmap = () => setMapReady(true);
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(mapKey)}&callback=initAmap`;
    script.async = true;
    script.onerror = () => setMessage("高德地图脚本加载失败，请检查地图 Key、服务平台和域名白名单。");
    document.head.appendChild(script);

    return () => {
      window.initAmap = undefined;
    };
  }, [canLoadMap, mapKey, mapSecurityCode]);

  useEffect(() => {
    if (window.AMap) {
      setMapReady(true);
    }
  }, []);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
  }, []);

  const loadEvents = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !databaseReady) {
      return;
    }

    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const params = new URLSearchParams({
      west: String(sw.getLng()),
      south: String(sw.getLat()),
      east: String(ne.getLng()),
      north: String(ne.getLat()),
      zoom: String(map.getZoom()),
    });

    if (filters.date) params.set("date", filters.date);
    if (filters.eventCode) params.set("eventCode", filters.eventCode);
    if (filters.country) params.set("country", filters.country);

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/map-data?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { events: MapEvent[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "地图数据查询失败");
      }

      if (payload.events.length > 0) {
        setEvents(payload.events);
        setVisibleEvents(payload.events);
      } else {
        setMessage("当前视窗没有事件，已保留最近一次结果；拖动地图或缩小范围可继续探索。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "地图数据查询失败");
    } finally {
      setLoading(false);
    }
  }, [databaseReady, filters.country, filters.date, filters.eventCode]);

  useEffect(() => {
    if (!mapReady || !mapEl.current || mapRef.current || !window.AMap) {
      return;
    }

    mapRef.current = new window.AMap.Map(mapEl.current, {
      center: [105, 30],
      zoom: 3,
      viewMode: "2D",
      mapStyle: "amap://styles/normal",
    });
    window.__mapnewsMap = mapRef.current;

    mapRef.current.on("complete", loadEvents);
    mapRef.current.on("moveend", loadEvents);
    mapRef.current.on("zoomend", loadEvents);
    loadEvents();
  }, [loadEvents, mapReady]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    loadEvents();
  }, [filters, loadEvents]);

  useEffect(() => {
    if (!mapRef.current || !window.AMap) {
      return;
    }

    clearMarkers();
    markersRef.current = visibleEvents.map((event) => {
      const marker = new window.AMap!.Marker({
        map: mapRef.current!,
        position: [event.lng, event.lat],
        title: event.title,
      });

      marker.on("click", async () => {
        setSelected(null);
        const response = await fetch(`/event-detail/${event.id}`, { cache: "no-store" });
        const payload = (await response.json()) as { event?: EventDetail };
        setSelected(payload.event ?? null);
      });

      return marker;
    });

    return clearMarkers;
  }, [clearMarkers, visibleEvents]);

  const quickStats = useMemo(() => {
    const articleCount = events.reduce((sum, event) => sum + event.articleCount, 0);
    return [
      { label: "事件点", value: events.length.toLocaleString("zh-CN") },
      { label: "关联报道", value: articleCount.toLocaleString("zh-CN") },
      { label: "当前日期", value: filters.date || "全部" },
    ];
  }, [events, filters.date]);

  return (
    <section className="map-workspace">
      <aside className="control-panel" aria-label="筛选条件">
        <label>
          日期
          <select value={filters.date} onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}>
            <option value="">全部日期</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>

        <label>
          事件类型
          <select
            value={filters.eventCode}
            onChange={(event) => setFilters((prev) => ({ ...prev, eventCode: event.target.value }))}
          >
            <option value="">全部类型</option>
            {eventCodes.map((code) => (
              <option key={code.value} value={code.value.slice(0, 2)}>
                {code.value} {code.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          国家/地区代码
          <select
            value={filters.country}
            onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
          >
            <option value="">全球</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <div className="stats-grid">
          {quickStats.map((stat) => (
            <div className="stat-cell" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        {selected ? (
          <article className="detail-panel">
            <p className="eyebrow">事件详情</p>
            <h2>{selected.summary}</h2>
            <dl>
              <div>
                <dt>地点</dt>
                <dd>{selected.actionGeoName || "未知"}</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{selected.eventCode}</dd>
              </div>
              <div>
                <dt>参与方</dt>
                <dd>{[selected.actor1Name, selected.actor2Name].filter(Boolean).join(" / ") || "未知"}</dd>
              </div>
              <div>
                <dt>报道数</dt>
                <dd>{selected.articleCount}</dd>
              </div>
            </dl>
            {selected.sourceUrl ? (
              <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                查看来源
              </a>
            ) : null}
          </article>
        ) : (
          <div className="empty-detail">点击地图事件点查看详情。</div>
        )}
      </aside>

      <div className="map-stage">
        {canLoadMap ? (
          <div ref={mapEl} className="map-canvas" />
        ) : (
          <div className="map-placeholder">
            <div className="preview-map">
              <span className="preview-point point-a" />
              <span className="preview-point point-b" />
              <span className="preview-point point-c" />
              <span className="preview-point point-d" />
              <div className="preview-copy">
                <strong>地图预览模式</strong>
                <span>在 `.env.local` 配置 `NEXT_PUBLIC_AMAP_KEY` 后会加载高德地图。</span>
              </div>
            </div>
          </div>
        )}
        <div className="map-overlay">
          {loading ? "正在加载事件..." : message ?? (databaseReady ? "拖动或缩放地图刷新事件" : "请先初始化数据库并导入数据")}
        </div>
      </div>
    </section>
  );
}
