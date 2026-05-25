"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import {
  labelFor,
  numberValue,
  useMapGeometry,
  type MapAssets,
  type MapBounds,
  type MapProperties,
  type MapSize,
  type MapView,
} from "@/components/hooks/use-map-geometry";
import type { HotspotMarkerView } from "@/components/map/hotspot-layer";
import { useWorkspaceData, type WorkspaceFilters } from "@/components/hooks/use-workspace-data";
import { MapRenderer } from "@/components/map/map-renderer";
import { DailyBriefCard } from "@/components/panel/daily-brief-card";
import { DetailsDrawer, type DetailTab } from "@/components/panel/details-drawer";
import { RankingList, type ResultSortMode } from "@/components/panel/ranking-list";
import type {
  DataStatus,
  DailyBrief,
  HotspotDetail,
  MapHotspot,
  QueryStatus,
  RegionTrend,
} from "@/lib/hotspots";

interface NewsMapProps {
  dates: string[];
  channels: readonly string[];
  databaseReady: boolean;
  initialStatus: DataStatus;
  initialHotspots: MapHotspot[];
  initialHotspotStatus: QueryStatus;
}

interface SearchTarget {
  id: string;
  type: "country" | "region" | "place";
  label: string;
  queryName: string;
  keys: string[];
  feature?: Feature<Geometry, MapProperties>;
  lng?: number;
  lat?: number;
  population?: number;
}

type RegionTrendPayload = { trend: RegionTrend };
type DailyBriefPayload = { brief: DailyBrief };
type EnrichmentState = {
  hotspotId: number;
  status: "running" | "success" | "error";
  message: string;
};
const MAP_VIEW_MIN_ZOOM = 1;
const MAP_VIEW_MAX_ZOOM = 40;

const CHANNEL_COLORS: Record<string, string> = {
  国际: "#0f8f7f",
  冲突: "#bc3f32",
  政治: "#4b6fb5",
  经济: "#b98221",
  灾害: "#7d4aa8",
  社会: "#52606d",
};

const QUAD_CLASS_COLORS: Record<number, string> = {
  1: "#42a5f5",
  2: "#43a047",
  3: "#fb8c00",
  4: "#e53935",
};

const THEME_LABELS: Record<string, string> = {
  国际: "国际关系",
  冲突: "冲突安全",
  政治: "政治治理",
  经济: "经济产业",
  灾害: "灾害事故",
  社会: "社会民生",
};

const GOLDSTEIN_NEGATIVE = "#dc2626";
const GOLDSTEIN_NEUTRAL = "#f8fafc";
const GOLDSTEIN_POSITIVE = "#2563eb";
const GOLDSTEIN_MISSING = "#94a3b8";

const DEMO_HOTSPOTS: MapHotspot[] = [
  {
    id: -1,
    regionKey: "demo:beijing",
    regionName: "北京, 中国",
    lat: 39.9042,
    lng: 116.4074,
    channel: "国际",
    primaryHotspotId: -1,
    channelCount: 3,
    channelBreakdown: [
      { hotspotId: -1, channel: "国际", heatScore: 620, eventCount: 32, mentionCount: 96, sourceCount: 28, summary: "演示国际关系热点。" },
      { hotspotId: -2, channel: "政治", heatScore: 360, eventCount: 18, mentionCount: 44, sourceCount: 16, summary: "演示政治治理热点。" },
      { hotspotId: -3, channel: "经济", heatScore: 210, eventCount: 11, mentionCount: 22, sourceCount: 9, summary: "演示经济产业热点。" },
    ],
    heatScore: 1190,
    eventCount: 61,
    mentionCount: 162,
    sourceCount: 53,
    dataDate: "演示数据",
    summary: "演示数据：北京显示为地区综合热点，用于说明地图、排行和详情交互。",
    dominantQuadClass: 1,
    quadClassLabel: "口头合作",
    quadClassBreakdown: [
      { quadClass: 1, label: "口头合作", eventCount: 28, share: 0.46 },
      { quadClass: 3, label: "口头冲突", eventCount: 18, share: 0.3 },
      { quadClass: 2, label: "实质合作", eventCount: 15, share: 0.24 },
    ],
    weightedGoldstein: 1.8,
    goldsteinMin: -3.2,
    goldsteinMax: 6.5,
    heatDelta: 120,
    trendLabel: "升温",
    topActors: [
      { name: "CHINA", count: 26 },
      { name: "UNITED STATES", count: 14 },
      { name: "BEIJING", count: 9 },
    ],
  },
  {
    id: -4,
    regionKey: "demo:tehran",
    regionName: "Tehran, Iran",
    lat: 35.6892,
    lng: 51.389,
    channel: "冲突",
    primaryHotspotId: -4,
    channelCount: 2,
    channelBreakdown: [
      { hotspotId: -4, channel: "冲突", heatScore: 780, eventCount: 40, mentionCount: 130, sourceCount: 35, summary: "演示冲突安全热点。" },
      { hotspotId: -5, channel: "国际", heatScore: 420, eventCount: 20, mentionCount: 70, sourceCount: 18, summary: "演示国际关系热点。" },
    ],
    heatScore: 1200,
    eventCount: 60,
    mentionCount: 200,
    sourceCount: 53,
    dataDate: "演示数据",
    summary: "演示数据：Tehran 显示为高热地区，点的大小代表综合热度。",
    dominantQuadClass: 4,
    quadClassLabel: "实质冲突",
    quadClassBreakdown: [
      { quadClass: 4, label: "实质冲突", eventCount: 35, share: 0.58 },
      { quadClass: 3, label: "口头冲突", eventCount: 25, share: 0.42 },
    ],
    weightedGoldstein: -4.6,
    goldsteinMin: -8,
    goldsteinMax: 1.5,
    heatDelta: 80,
    trendLabel: "活跃",
    topActors: [
      { name: "IRAN", count: 31 },
      { name: "TEHRAN", count: 12 },
    ],
  },
  {
    id: -6,
    regionKey: "demo:washington",
    regionName: "Washington, United States",
    lat: 38.9072,
    lng: -77.0369,
    channel: "政治",
    primaryHotspotId: -6,
    channelCount: 2,
    channelBreakdown: [
      { hotspotId: -6, channel: "政治", heatScore: 720, eventCount: 36, mentionCount: 88, sourceCount: 30, summary: "演示政治治理热点。" },
      { hotspotId: -7, channel: "社会", heatScore: 180, eventCount: 10, mentionCount: 20, sourceCount: 8, summary: "演示社会民生热点。" },
    ],
    heatScore: 900,
    eventCount: 46,
    mentionCount: 108,
    sourceCount: 38,
    dataDate: "演示数据",
    summary: "演示数据：Washington 显示为政治治理热点，点击可查看演示态势。",
    dominantQuadClass: 3,
    quadClassLabel: "口头冲突",
    quadClassBreakdown: [
      { quadClass: 3, label: "口头冲突", eventCount: 24, share: 0.52 },
      { quadClass: 1, label: "口头合作", eventCount: 22, share: 0.48 },
    ],
    weightedGoldstein: -0.8,
    goldsteinMin: -5,
    goldsteinMax: 4,
    heatDelta: -45,
    trendLabel: "冷却",
    topActors: [
      { name: "UNITED STATES", count: 22 },
      { name: "WASHINGTON", count: 11 },
    ],
  },
  {
    id: -8,
    regionKey: "demo:new-delhi",
    regionName: "New Delhi, India",
    lat: 28.6139,
    lng: 77.209,
    channel: "经济",
    primaryHotspotId: -8,
    channelCount: 2,
    channelBreakdown: [
      { hotspotId: -8, channel: "经济", heatScore: 520, eventCount: 24, mentionCount: 55, sourceCount: 22, summary: "演示经济产业热点。" },
      { hotspotId: -9, channel: "国际", heatScore: 260, eventCount: 12, mentionCount: 28, sourceCount: 11, summary: "演示国际关系热点。" },
    ],
    heatScore: 780,
    eventCount: 36,
    mentionCount: 83,
    sourceCount: 33,
    dataDate: "演示数据",
    summary: "演示数据：New Delhi 用于展示经济和国际话题占比。",
    dominantQuadClass: 2,
    quadClassLabel: "实质合作",
    quadClassBreakdown: [
      { quadClass: 2, label: "实质合作", eventCount: 21, share: 0.58 },
      { quadClass: 1, label: "口头合作", eventCount: 15, share: 0.42 },
    ],
    weightedGoldstein: 3.2,
    goldsteinMin: -1,
    goldsteinMax: 7,
    heatDelta: 30,
    trendLabel: "升温",
    topActors: [
      { name: "INDIA", count: 20 },
      { name: "NEW DELHI", count: 8 },
    ],
  },
];

const COUNTRY_ALIASES: Record<string, string[]> = {
  CHN: ["中国", "中华人民共和国", "China"],
  USA: ["美国", "美利坚合众国", "United States", "United States of America"],
  GBR: ["英国", "United Kingdom", "Great Britain"],
  RUS: ["俄罗斯", "Russia", "Russian Federation"],
  JPN: ["日本", "Japan"],
  KOR: ["韩国", "South Korea", "Republic of Korea"],
  PRK: ["朝鲜", "North Korea"],
  FRA: ["法国", "France"],
  DEU: ["德国", "Germany"],
  IND: ["印度", "India"],
};

const COUNTRY_QUERY_NAMES: Record<string, string> = {
  CHN: "China",
  USA: "United States",
  GBR: "United Kingdom",
  RUS: "Russia",
  JPN: "Japan",
  KOR: "South Korea",
  PRK: "North Korea",
  FRA: "France",
  DEU: "Germany",
  IND: "India",
};

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function queryNameFor(properties: MapProperties) {
  const countryCode = properties.id || properties.country_code || "";
  return COUNTRY_QUERY_NAMES[countryCode] || properties.name_en || properties.name_ascii || properties.name || labelFor(properties);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function quantile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
}

function markerSizeForHeat(heatScore: number, lowHeat: number, highHeat: number) {
  const low = Math.max(1, lowHeat);
  const high = Math.max(low + 1, highHeat);
  const normalized = clamp((Math.log(heatScore + 1) - Math.log(low + 1)) / (Math.log(high + 1) - Math.log(low + 1)), 0, 1);
  return Math.round(20 + Math.sqrt(normalized) * 28);
}

function heatIntensityFor(heatScore: number, lowHeat: number, highHeat: number) {
  const low = Math.max(1, lowHeat);
  const high = Math.max(low + 1, highHeat);
  return clamp((Math.log(heatScore + 1) - Math.log(low + 1)) / (Math.log(high + 1) - Math.log(low + 1)), 0, 1);
}

function themeLabel(channel: string) {
  return THEME_LABELS[channel] ?? channel;
}

function situationColor(hotspot: MapHotspot) {
  return hotspot.dominantQuadClass ? (QUAD_CLASS_COLORS[hotspot.dominantQuadClass] ?? "#64748b") : "#64748b";
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixHexColor(fromColor: string, toColor: string, ratio: number) {
  const from = hexToRgb(fromColor);
  const to = hexToRgb(toColor);
  const amount = clamp(ratio, 0, 1);
  const channel = (fromValue: number, toValue: number) => Math.round(fromValue + (toValue - fromValue) * amount);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

function goldsteinColor(value: number | null) {
  if (value === null) return GOLDSTEIN_MISSING;
  const normalized = clamp(value, -10, 10);
  if (normalized < 0) return mixHexColor(GOLDSTEIN_NEGATIVE, GOLDSTEIN_NEUTRAL, (normalized + 10) / 10);
  return mixHexColor(GOLDSTEIN_NEUTRAL, GOLDSTEIN_POSITIVE, normalized / 10);
}

function goldsteinToneLabel(value: number | null) {
  if (value === null) return "暂无倾向";
  if (value <= -4) return "冲突倾向强";
  if (value < -1) return "冲突倾向";
  if (value <= 1) return "中性/混合";
  if (value < 4) return "合作倾向";
  return "合作倾向强";
}

function trendClassName(trendLabel: string) {
  if (trendLabel === "升温") return "warming";
  if (trendLabel === "活跃") return "active";
  if (trendLabel === "冷却") return "cooling";
  return "no-comparison";
}

function trendGlowFor(trendLabel: string, ringRadius: number) {
  if (trendLabel === "升温") return { radius: ringRadius + 24, opacity: 0.34 };
  if (trendLabel === "活跃") return { radius: ringRadius + 14, opacity: 0.16 };
  if (trendLabel === "冷却") return { radius: ringRadius + 10, opacity: 0.08 };
  return { radius: ringRadius + 8, opacity: 0 };
}

function formatHeatDelta(value: number | null) {
  if (value === null) return "暂无对比";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function formatGoldstein(value: number | null) {
  if (value === null) return "暂无";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function compareHotspotsByHeat(left: MapHotspot, right: MapHotspot) {
  return (
    right.heatScore - left.heatScore ||
    right.sourceCount - left.sourceCount ||
    left.regionName.localeCompare(right.regionName, "zh-CN")
  );
}

function attitudeSortValue(hotspot: MapHotspot) {
  return hotspot.weightedGoldstein ?? Number.POSITIVE_INFINITY;
}

function sortResultHotspots(items: MapHotspot[], sortMode: ResultSortMode) {
  const sorted = [...items];
  if (sortMode === "attitude") {
    return sorted.sort(
      (left, right) =>
        attitudeSortValue(left) - attitudeSortValue(right) ||
        right.heatScore - left.heatScore ||
        right.sourceCount - left.sourceCount ||
        left.regionName.localeCompare(right.regionName, "zh-CN"),
    );
  }
  return sorted.sort(compareHotspotsByHeat);
}

function hotspotLimitForZoom(zoom: number) {
  if (zoom <= 1.4) return 90;
  if (zoom <= 2.2) return 160;
  if (zoom <= 4) return 260;
  if (zoom <= 8) return 420;
  return Number.POSITIVE_INFINITY;
}

function hotspotCandidateLimitForZoom(zoom: number, total: number) {
  const visibleLimit = hotspotLimitForZoom(zoom);
  if (!Number.isFinite(visibleLimit)) return total;
  return Math.min(total, visibleLimit * 4);
}

function hotspotSpacingForZoom(zoom: number) {
  if (zoom <= 1.4) return 14;
  if (zoom <= 2.2) return 10;
  if (zoom <= 4) return 6;
  if (zoom <= 8) return 4;
  return 2;
}

function declutterHotspotMarkers(markers: HotspotMarkerView[], zoom: number) {
  const maxVisible = hotspotLimitForZoom(zoom);
  const spacing = hotspotSpacingForZoom(zoom);
  const selected = markers.find((marker) => marker.selected);
  const kept: HotspotMarkerView[] = [];
  const sortedMarkers = [...markers]
    .filter((marker) => marker !== selected)
    .sort((a, b) => b.hotspot.heatScore - a.hotspot.heatScore);

  for (const marker of sortedMarkers) {
    if (kept.length >= maxVisible) break;
    const overlaps = kept.some((keptMarker) => {
      const dx = marker.x - keptMarker.x;
      const dy = marker.y - keptMarker.y;
      const minDistance = marker.collisionRadius + keptMarker.collisionRadius + spacing;
      return dx * dx + dy * dy < minDistance * minDistance;
    });
    if (!overlaps) kept.push(marker);
  }

  const visibleMarkers = selected ? [...kept, selected] : kept;
  return visibleMarkers.sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? 1 : -1;
    return a.hotspot.heatScore - b.hotspot.heatScore;
  });
}

function orderVisibleHotspotMarkers(markers: HotspotMarkerView[]) {
  return [...markers].sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? 1 : -1;
    return a.hotspot.heatScore - b.hotspot.heatScore;
  });
}

function searchTargetMatchesHotspot(target: SearchTarget, hotspot: MapHotspot) {
  const regionName = normalizeSearchText(hotspot.regionName);
  const queryName = normalizeSearchText(target.queryName);
  const label = normalizeSearchText(target.label);
  return (
    regionName === queryName ||
    regionName === label ||
    regionName.startsWith(`${queryName},`) ||
    regionName.startsWith(`${label},`)
  );
}

function findHotspotForSearchTarget(target: SearchTarget, hotspots: MapHotspot[]) {
  return hotspots.find((hotspot) => searchTargetMatchesHotspot(target, hotspot)) ?? null;
}

function hotspotNeedsEnrichment(hotspot: HotspotDetail) {
  const quality = hotspot.explanation.sourceQuality;
  return !quality.enhanced || hotspot.storyGroups.length === 0 || quality.candidateSourceCount === 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMapJson<T extends FeatureCollection<Geometry, MapProperties>>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`地图资产加载失败：${url}`);
  return (await response.json()) as T;
}

function screenPoint(
  projection: GeoProjection | null,
  view: MapView,
  lng: number,
  lat: number,
): [number, number] | null {
  const point = projection?.([lng, lat]);
  if (!point) return null;
  return [point[0] * view.k + view.x, point[1] * view.k + view.y];
}

function screenToLonLat(
  projection: GeoProjection | null,
  view: MapView,
  x: number,
  y: number,
): [number, number] | null {
  const invert = projection?.invert;
  if (!invert) return null;
  const point = invert([(x - view.x) / view.k, (y - view.y) / view.k]);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  return [clamp(point[0], -180, 180), clamp(point[1], -90, 90)];
}

function bboxFromView(projection: GeoProjection | null, view: MapView, size: MapSize) {
  if (!projection || size.width <= 0 || size.height <= 0) return null;
  const corners = [
    screenToLonLat(projection, view, 0, 0),
    screenToLonLat(projection, view, size.width, 0),
    screenToLonLat(projection, view, size.width, size.height),
    screenToLonLat(projection, view, 0, size.height),
  ].filter((point): point is [number, number] => point !== null);
  if (corners.length === 0) return null;
  const lons = corners.map((point) => point[0]);
  const lats = corners.map((point) => point[1]);
  return {
    west: Math.max(-180, Math.min(...lons)),
    south: Math.max(-90, Math.min(...lats)),
    east: Math.min(180, Math.max(...lons)),
    north: Math.min(90, Math.max(...lats)),
  };
}

function clampMapAxis(offset: number, zoom: number, viewportLength: number, min: number, max: number) {
  const contentLength = Math.max(1, (max - min) * zoom);
  if (contentLength <= viewportLength) {
    return (viewportLength - (min + max) * zoom) / 2;
  }
  return clamp(offset, viewportLength - max * zoom, -min * zoom);
}

function clampMapView(view: MapView, size: MapSize, bounds: MapBounds | null) {
  const k = clamp(view.k, MAP_VIEW_MIN_ZOOM, MAP_VIEW_MAX_ZOOM);
  if (bounds && size.width > 0 && size.height > 0) {
    return {
      k,
      x: clampMapAxis(view.x, k, size.width, bounds.x0, bounds.x1),
      y: clampMapAxis(view.y, k, size.height, bounds.y0, bounds.y1),
    };
  }
  const limit = Math.max(size.width, size.height) * k;
  return {
    k,
    x: clamp(view.x, -limit, limit),
    y: clamp(view.y, -limit, limit),
  };
}

function isScreenVisible(point: [number, number] | null, size: MapSize, margin = 40) {
  if (!point) return false;
  return point[0] >= -margin && point[0] <= size.width + margin && point[1] >= -margin && point[1] <= size.height + margin;
}

function viewportKey(projection: GeoProjection | null, view: MapView, size: MapSize) {
  const bbox = bboxFromView(projection, view, size);
  if (!bbox) return null;
  return [
    bbox.west.toFixed(2),
    bbox.south.toFixed(2),
    bbox.east.toFixed(2),
    bbox.north.toFixed(2),
    view.k.toFixed(2),
  ].join(",");
}

function buildSearchTargets(assets: MapAssets | null): SearchTarget[] {
  if (!assets) return [];
  const countries = assets.countries.features.map((feature, index): SearchTarget => {
    const properties = feature.properties ?? {};
    const countryCode = properties.id || "";
    const aliases = COUNTRY_ALIASES[countryCode] ?? [];
    return {
      id: `country-${countryCode || index}`,
      type: "country",
      label: labelFor(properties),
      queryName: queryNameFor(properties),
      keys: uniqueStrings([
        properties.name,
        properties.name_en,
        properties.name_zh,
        properties.admin,
        COUNTRY_QUERY_NAMES[countryCode],
        ...aliases,
      ]),
      feature,
      population: numberValue(properties.population),
    };
  });

  const regions = assets.regions.features.map((feature, index): SearchTarget => {
    const properties = feature.properties ?? {};
    return {
      id: `region-${properties.id ?? index}`,
      type: "region",
      label: labelFor(properties),
      queryName: properties.name_en || properties.name || labelFor(properties),
      keys: uniqueStrings([
        properties.name,
        properties.name_en,
        properties.name_zh,
        properties.country,
        `${properties.name_en ?? properties.name ?? ""}, ${properties.country ?? ""}`,
        `${properties.name_zh ?? ""}${properties.country ?? ""}`,
      ]),
      feature,
      lng: properties.longitude,
      lat: properties.latitude,
    };
  });

  const places = assets.places.features.map((feature, index): SearchTarget => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    return {
      id: `place-${properties.name_ascii ?? properties.name ?? index}-${properties.country_code ?? ""}`,
      type: "place",
      label: labelFor(properties),
      queryName: properties.name_en || properties.name_ascii || properties.name || labelFor(properties),
      keys: uniqueStrings([
        properties.name,
        properties.name_ascii,
        properties.name_en,
        properties.name_zh,
        properties.country,
        properties.region,
        `${properties.name_en ?? properties.name_ascii ?? properties.name ?? ""}, ${properties.country ?? ""}`,
        `${properties.name_zh ?? ""}${properties.country ?? ""}`,
      ]),
      lng: coordinates?.[0] ?? properties.longitude,
      lat: coordinates?.[1] ?? properties.latitude,
      population: numberValue(properties.population),
    };
  });

  return [...countries, ...regions, ...places];
}

function findSearchTarget(query: string, targets: SearchTarget[]) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  const typeWeight = { country: 30, region: 20, place: 10 };
  let best: { target: SearchTarget; score: number } | null = null;

  for (const target of targets) {
    let score = 0;
    for (const key of target.keys) {
      const normalizedKey = normalizeSearchText(key);
      if (!normalizedKey) continue;
      if (normalizedKey === normalizedQuery) score = Math.max(score, 100);
      else if (normalizedKey.startsWith(normalizedQuery)) score = Math.max(score, 72);
      else if (normalizedKey.includes(normalizedQuery)) score = Math.max(score, 45);
    }
    if (score === 0) continue;
    score += typeWeight[target.type] + Math.min(Math.log10((target.population ?? 0) + 1), 8);
    if (!best || score > best.score) best = { target, score };
  }

  return best?.target ?? null;
}

export function NewsMap({
  dates,
  channels,
  databaseReady,
  initialStatus,
  initialHotspots,
  initialHotspotStatus,
}: NewsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const trendAbortRef = useRef<AbortController | null>(null);
  const enrichmentPollRef = useRef<Map<number, boolean>>(new Map());
  const channelRequestRef = useRef(0);
  const selectedFocusRef = useRef<string | null>(null);
  const projectionRef = useRef<GeoProjection | null>(null);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const sizeRef = useRef<MapSize>({ width: 0, height: 0 });
  const mapViewRef = useRef<MapView>({ x: 0, y: 0, k: 1 });
  const pendingMapViewRef = useRef<MapView | null>(null);
  const mapFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean; startedOnBlank: boolean } | null>(null);
  const sortLoadReadyRef = useRef(false);

  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [size, setSize] = useState<MapSize>({ width: 0, height: 0 });
  const [mapView, setMapViewState] = useState<MapView>({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<MapHotspot | null>(null);
  const [selected, setSelected] = useState<HotspotDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("region");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [regionTrend, setRegionTrend] = useState<RegionTrend | null>(null);
  const [regionTrendMessage, setRegionTrendMessage] = useState<string | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [dailyBriefLoading, setDailyBriefLoading] = useState(false);
  const [dailyBriefMessage, setDailyBriefMessage] = useState<string | null>(null);
  const [hoveredRegionKey, setHoveredRegionKey] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<number | null>(null);
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [resultSortMode, setResultSortMode] = useState<ResultSortMode>("heat");
  const [filters, setFilters] = useState<WorkspaceFilters>({ date: dates[0] ?? "", channel: "", q: "" });
  const [locatedTarget, setLocatedTarget] = useState<SearchTarget | null>(null);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<SearchTarget | null>(null);

  const { projection, mapContentBounds, countryPaths, regionPaths, mapLabels } = useMapGeometry(assets, size, mapView);
  const mapReady = Boolean(assets && projection && size.width > 0 && size.height > 0);
  const showAllMapMarkers = mapView.k > 8;
  const queryParams = useCallback(
    (withBounds: boolean, purpose: "map" | "ranking" = "map") => {
      const params = new URLSearchParams();
      if (filters.date) params.set("date", filters.date);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.q) params.set("q", filters.q);
      if (resultSortMode === "attitude") params.set("sort", "attitude");
      if (purpose === "ranking") {
        params.set("limit", "20");
        return params;
      } else if (filters.q || mapViewRef.current.k > 8) {
        params.set("limit", "1200");
      }
      if (withBounds) {
        const bbox = bboxFromView(projectionRef.current, mapViewRef.current, sizeRef.current);
        if (bbox && bbox.east > bbox.west && bbox.north > bbox.south) {
          params.set("west", String(bbox.west));
          params.set("south", String(bbox.south));
          params.set("east", String(bbox.east));
          params.set("north", String(bbox.north));
        }
      }
      return params;
    },
    [filters, resultSortMode],
  );
  const currentViewportKey = mapReady ? viewportKey(projection, mapView, size) : null;
  const workspaceViewportKey = currentViewportKey;
  const hasInitialWorkspacePayload =
    initialHotspotStatus.ok || initialHotspots.length > 0 || !databaseReady;
  const {
    hotspots,
    ranking,
    status,
    loading,
    message,
    setMessage,
    scheduleHotspotLoad,
    preserveRankingForViewport,
  } = useWorkspaceData({
    databaseReady,
    mapReady,
    filters,
    initialStatus,
    initialHotspots,
    initialHotspotStatus,
    hasInitialWorkspacePayload,
    viewportKey: workspaceViewportKey,
    queryParams,
  });
  const systemEmpty = !loading && hotspots.length === 0 && (!databaseReady || (!status.currentDataDate && dates.length === 0));
  const showDemoMode = systemEmpty;
  const displayHotspots = showDemoMode ? DEMO_HOTSPOTS : hotspots;
  const rawDisplayRanking = showDemoMode ? DEMO_HOTSPOTS : ranking;
  const displayRanking = useMemo(
    () => sortResultHotspots(rawDisplayRanking, resultSortMode),
    [rawDisplayRanking, resultSortMode],
  );
  const candidateHotspots = useMemo(() => {
    const limit = showAllMapMarkers ? displayHotspots.length : hotspotCandidateLimitForZoom(mapView.k, displayHotspots.length);
    const candidates = displayHotspots.slice(0, limit);
    if (selectedRegion && !candidates.some((hotspot) => hotspot.regionKey === selectedRegion.regionKey && hotspot.dataDate === selectedRegion.dataDate)) {
      candidates.push(selectedRegion);
    }
    return candidates;
  }, [displayHotspots, mapView.k, selectedRegion, showAllMapMarkers]);
  const hotspotHeatScale = useMemo(() => {
    const values = displayHotspots
      .map((hotspot) => hotspot.heatScore)
      .filter((heatScore) => Number.isFinite(heatScore) && heatScore > 0)
      .sort((a, b) => a - b);
    return {
      low: quantile(values, 0.5),
      high: quantile(values, 0.95),
    };
  }, [displayHotspots]);
  const maxRankingHeat = Math.max(...displayRanking.map((item) => item.heatScore), 1);
  const selectedRegionRank = useMemo(() => {
    if (!selectedRegion) return null;
    const rankingIndex = displayRanking.findIndex(
      (item) => item.regionKey === selectedRegion.regionKey && item.dataDate === selectedRegion.dataDate,
    );
    if (rankingIndex >= 0) return rankingIndex + 1;
    const hotspotIndex = displayHotspots.findIndex(
      (item) => item.regionKey === selectedRegion.regionKey && item.dataDate === selectedRegion.dataDate,
    );
    return hotspotIndex >= 0 ? hotspotIndex + 1 : null;
  }, [displayHotspots, displayRanking, selectedRegion]);
  const selectedEnrichmentState =
    selected && enrichmentState?.hotspotId === selected.id ? enrichmentState : null;
  const searchTargets = useMemo(() => buildSearchTargets(assets), [assets]);

  useEffect(() => {
    if (!databaseReady) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.date) params.set("date", filters.date);
    setDailyBriefLoading(true);
    setDailyBriefMessage(null);
    void fetch(`/api/daily-brief?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as Partial<DailyBriefPayload> & { error?: string };
        if (!response.ok || !payload.brief) {
          throw new Error(payload.error ?? "简报加载失败。");
        }
        setDailyBrief(payload.brief);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDailyBriefMessage(error instanceof Error ? error.message : "简报加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDailyBriefLoading(false);
      });
    return () => controller.abort();
  }, [databaseReady, filters.date]);

  useEffect(() => {
    if (!databaseReady || !mapReady) return;
    if (!sortLoadReadyRef.current) {
      sortLoadReadyRef.current = true;
      return;
    }
    preserveRankingForViewport(0);
    scheduleHotspotLoad();
  }, [databaseReady, mapReady, preserveRankingForViewport, resultSortMode, scheduleHotspotLoad]);

  useEffect(() => {
    if (!pendingSearchTarget || loading) return;
    const hotspot = findHotspotForSearchTarget(pendingSearchTarget, displayHotspots);
    if (!hotspot) {
      setSearchMessage(`已定位到 ${pendingSearchTarget.label}，当前范围暂无匹配热点。`);
      setPendingSearchTarget(null);
      return;
    }
    openRegionHotspot(hotspot);
    setSearchMessage(`已定位到 ${pendingSearchTarget.label}，已打开匹配热点。`);
    setPendingSearchTarget(null);
  }, [displayHotspots, loading, pendingSearchTarget]);

  const hotspotMarkers = useMemo(() => {
    if (!projection) return [];
    const candidateMarkers = candidateHotspots
      .map((hotspot) => {
        const point = screenPoint(projection, mapView, hotspot.lng, hotspot.lat);
        if (!isScreenVisible(point, size, 18)) return null;
        const markerKey = hotspot.regionKey;
        const selected =
          hotspot.regionKey === selectedRegion?.regionKey && hotspot.dataDate === selectedRegion.dataDate;
        const hovered = markerKey === hoveredRegionKey;
        const color = goldsteinColor(hotspot.weightedGoldstein);
        const heatIntensity = heatIntensityFor(hotspot.heatScore, hotspotHeatScale.low, hotspotHeatScale.high);
        const sizePx = markerSizeForHeat(hotspot.heatScore, hotspotHeatScale.low, hotspotHeatScale.high);
        const ringRadius = sizePx / 2 + 5;
        const trendGlow = trendGlowFor(hotspot.trendLabel, ringRadius);
        const themeSummary = hotspot.channelBreakdown
          .slice(0, 4)
          .map((item) => `${themeLabel(item.channel)}${Math.round((item.heatScore / Math.max(hotspot.heatScore, 1)) * 100)}%`)
          .join("、");
        return {
          markerKey,
          hotspot,
          x: point![0],
          y: point![1],
          color,
          sizePx,
          ringRadius,
          themeSummary,
          goldsteinText: `${formatGoldstein(hotspot.weightedGoldstein)}，${goldsteinToneLabel(hotspot.weightedGoldstein)}`,
          heatIntensity,
          trendGlowRadius: trendGlow.radius,
          trendGlowOpacity: trendGlow.opacity,
          collisionRadius: sizePx / 2 + 6 + heatIntensity * 2,
          selected,
          hovered,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return showAllMapMarkers ? orderVisibleHotspotMarkers(candidateMarkers) : declutterHotspotMarkers(candidateMarkers, mapView.k);
  }, [candidateHotspots, hotspotHeatScale, hoveredRegionKey, mapView, projection, selectedRegion, showAllMapMarkers, size]);

  const hoveredMarker = useMemo(
    () => hotspotMarkers.find((marker) => marker.markerKey === hoveredRegionKey) ?? null,
    [hotspotMarkers, hoveredRegionKey],
  );

  const setMapView = useCallback(
    (next: MapView) => {
      const clamped = clampMapView(next, sizeRef.current, mapBoundsRef.current);
      mapViewRef.current = clamped;
      pendingMapViewRef.current = clamped;
      if (mapFrameRef.current !== null) return;
      mapFrameRef.current = window.requestAnimationFrame(() => {
        mapFrameRef.current = null;
        const pending = pendingMapViewRef.current;
        if (!pending) return;
        pendingMapViewRef.current = null;
        setMapViewState(pending);
      });
    },
    [],
  );

  useEffect(() => {
    mapBoundsRef.current = mapContentBounds;
    if (mapContentBounds) setMapView(mapViewRef.current);
  }, [mapContentBounds, setMapView]);

  useEffect(() => {
    return () => {
      if (mapFrameRef.current !== null) {
        window.cancelAnimationFrame(mapFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchMapJson<FeatureCollection<Geometry, MapProperties>>("/maps/countries.geojson"),
      fetchMapJson<FeatureCollection<Geometry, MapProperties>>("/maps/regions.geojson"),
      fetchMapJson<FeatureCollection<Point, MapProperties>>("/maps/places.geojson"),
    ])
      .then(([countries, regions, places]) => {
        if (!active) return;
        setAssets({ countries, regions, places });
        setMapLoadError(null);
      })
      .catch((error) => {
        if (!active) return;
        setMapLoadError(error instanceof Error ? error.message : "本地地图资产加载失败。");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mapEl.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const nextSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
      sizeRef.current = nextSize;
      setSize(nextSize);
    });
    observer.observe(mapEl.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => {
    if (!selectedRegion) {
      selectedFocusRef.current = null;
      return;
    }
    if (!projection || size.width <= 0 || size.height <= 0) return;
    const focusKey = `${selectedRegion.regionKey}:${selectedRegion.dataDate}:${size.width}x${size.height}`;
    if (selectedFocusRef.current === focusKey) return;
    selectedFocusRef.current = focusKey;
    zoomToPoint(selectedRegion.lng, selectedRegion.lat, mapViewRef.current.k);
  }, [projection, selectedRegion, size.height, size.width]);

  useEffect(() => {
    trendAbortRef.current?.abort();
    if (!selectedRegion) {
      setRegionTrend(null);
      setRegionTrendMessage(null);
      return;
    }
    if (selectedRegion.id < 0) {
      setRegionTrend(null);
      setRegionTrendMessage("演示模式不加载真实趋势数据。");
      return;
    }

    const controller = new AbortController();
    trendAbortRef.current = controller;
    setRegionTrendMessage("正在加载近90天趋势。");
    const params = new URLSearchParams({
      regionKey: selectedRegion.regionKey,
      date: selectedRegion.dataDate,
      days: "90",
    });
    void fetch(`/api/region-trends?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as Partial<RegionTrendPayload> & { error?: string };
        if (!response.ok || !payload.trend) {
          throw new Error(payload.error ?? "趋势数据加载失败。");
        }
        setRegionTrend(payload.trend);
        setRegionTrendMessage(null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRegionTrend(null);
        setRegionTrendMessage(error instanceof Error ? error.message : "趋势数据加载失败。");
      });
    return () => controller.abort();
  }, [selectedRegion]);

  function zoomToPoint(lng: number, lat: number, zoom: number) {
    const point = projection?.([lng, lat]);
    if (!point || size.width <= 0 || size.height <= 0) return;
    setMapView({
      k: clamp(zoom, MAP_VIEW_MIN_ZOOM, MAP_VIEW_MAX_ZOOM),
      x: size.width / 2 - point[0] * zoom,
      y: size.height / 2 - point[1] * zoom,
    });
  }

  function resetToGlobalView() {
    setMapView({ x: 0, y: 0, k: 1 });
  }

  function fitFeature(feature: Feature<Geometry, MapProperties>, maxZoom: number) {
    if (!projection || size.width <= 0 || size.height <= 0) return;
    const localPath = geoPath(projection);
    const [[x0, y0], [x1, y1]] = localPath.bounds(feature as GeoPermissibleObjects);
    const dx = Math.max(1, x1 - x0);
    const dy = Math.max(1, y1 - y0);
    const padding = 88;
    const k = clamp(
      Math.min((size.width - padding) / dx, (size.height - padding) / dy),
      1.15,
      maxZoom,
    );
    setMapView({
      k,
      x: size.width / 2 - ((x0 + x1) / 2) * k,
      y: size.height / 2 - ((y0 + y1) / 2) * k,
    });
  }

  function closeDetailsDrawer() {
    setSelectedRegion(null);
    setSelected(null);
    setExpandedStoryId(null);
    setEnrichmentState(null);
    setSourceMessage(null);
    setDetailTab("region");
  }

  function focusSearchTarget(target: SearchTarget) {
    if (target.feature) {
      fitFeature(target.feature, target.type === "country" ? 4.2 : 9.5);
      return;
    }
    if (typeof target.lng === "number" && typeof target.lat === "number") {
      zoomToPoint(target.lng, target.lat, target.type === "place" ? 12 : 9);
    }
  }

  function zoomBy(factor: number) {
    if (size.width <= 0 || size.height <= 0) return;
    const current = mapViewRef.current;
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const nextZoom = clamp(current.k * factor, MAP_VIEW_MIN_ZOOM, MAP_VIEW_MAX_ZOOM);
    const localX = (centerX - current.x) / current.k;
    const localY = (centerY - current.y) / current.k;
    setMapView({
      k: nextZoom,
      x: centerX - localX * nextZoom,
      y: centerY - localY * nextZoom,
    });
    scheduleHotspotLoad("viewport");
  }

  function handleResetMapView() {
    resetToGlobalView();
    scheduleHotspotLoad("viewport");
  }

  function fitCurrentResults() {
    if (!projection || size.width <= 0 || size.height <= 0) return;
    const points = displayHotspots
      .map((hotspot) => projection([hotspot.lng, hotspot.lat]))
      .filter((point): point is [number, number] => Boolean(point));
    if (points.length === 0) {
      setSearchMessage("当前结果为空，无法适配地图范围。");
      return;
    }
    if (points.length === 1) {
      const hotspot = displayHotspots[0];
      if (hotspot) zoomToPoint(hotspot.lng, hotspot.lat, Math.max(mapViewRef.current.k, 7));
      scheduleHotspotLoad("viewport");
      return;
    }
    const x0 = Math.min(...points.map((point) => point[0]));
    const x1 = Math.max(...points.map((point) => point[0]));
    const y0 = Math.min(...points.map((point) => point[1]));
    const y1 = Math.max(...points.map((point) => point[1]));
    const dx = Math.max(1, x1 - x0);
    const dy = Math.max(1, y1 - y0);
    const padding = Math.min(180, Math.max(72, Math.min(size.width, size.height) * 0.18));
    const k = clamp(
      Math.min((size.width - padding) / dx, (size.height - padding) / dy),
      MAP_VIEW_MIN_ZOOM,
      MAP_VIEW_MAX_ZOOM,
    );
    setMapView({
      k,
      x: size.width / 2 - ((x0 + x1) / 2) * k,
      y: size.height / 2 - ((y0 + y1) / 2) * k,
    });
    scheduleHotspotLoad("viewport");
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    if (!mapReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const current = mapViewRef.current;
    const wheelPixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 240 : event.deltaY;
    const zoomFactor = Math.exp(-wheelPixels * 0.0018);
    const nextZoom = clamp(current.k * zoomFactor, MAP_VIEW_MIN_ZOOM, MAP_VIEW_MAX_ZOOM);
    const localX = (mouseX - current.x) / current.k;
    const localY = (mouseY - current.y) / current.k;
    setMapView({
      k: nextZoom,
      x: mouseX - localX * nextZoom,
      y: mouseY - localY * nextZoom,
    });
    scheduleHotspotLoad("viewport");
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !mapReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startedOnBlank = event.target instanceof Element && event.target.classList.contains("map-click-catcher");
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, startedOnBlank };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const current = mapViewRef.current;
    setMapView({ ...current, x: current.x + dx, y: current.y + dy });
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      scheduleHotspotLoad("viewport");
      return;
    }
    if (drag.startedOnBlank) {
      closeDetailsDrawer();
    }
  }

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
      message: "正在补充来源信息，并整理主要报道。",
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

  function openRegionHotspot(hotspot: MapHotspot) {
    setSelectedRegion(hotspot);
    setSelected(null);
    setExpandedStoryId(null);
    setEnrichmentState(null);
    setSourceMessage(null);
    setDetailTab("region");
    if (hotspot.primaryHotspotId < 0) {
      setSourceMessage("演示模式不加载真实相关新闻。真实数据导入完成后可查看主要报道和原文链接。");
      return;
    }
    void loadChannelHotspot(hotspot.primaryHotspotId, { switchToSource: false, triggerEnrichment: true });
  }

  async function loadChannelHotspot(
    id: number,
    options: { switchToSource: boolean; triggerEnrichment: boolean },
  ) {
    const requestId = channelRequestRef.current + 1;
    channelRequestRef.current = requestId;
    setSourceLoading(true);
    setSourceMessage(null);
    try {
      const hotspot = await fetchHotspotDetail(id);
      if (requestId !== channelRequestRef.current) return;
      setSelected(hotspot);
      setExpandedStoryId(hotspot?.storyGroups[0]?.id ?? null);
      if (options.switchToSource) setDetailTab("source");
      if (!hotspot) {
        setSourceMessage("未找到该话题相关新闻。");
        setEnrichmentState(null);
        return;
      }
      if (options.triggerEnrichment && hotspotNeedsEnrichment(hotspot)) {
        void triggerHotspotEnrichment(id);
      } else {
        setEnrichmentState(null);
      }
    } catch (error) {
      if (requestId !== channelRequestRef.current) return;
      setSelected(null);
      setExpandedStoryId(null);
      setSourceMessage(error instanceof Error ? error.message : "相关新闻加载失败。");
      setEnrichmentState(null);
      if (options.switchToSource) setDetailTab("source");
    } finally {
      if (requestId === channelRequestRef.current) setSourceLoading(false);
    }
  }

  function openChannelHotspot(id: number) {
    if (id < 0) {
      setSelected(null);
      setExpandedStoryId(null);
      setEnrichmentState(null);
      setSourceMessage("演示模式不加载真实相关新闻。真实数据导入完成后可切换话题查看来源。");
      setDetailTab("source");
      return;
    }
    void loadChannelHotspot(id, { switchToSource: true, triggerEnrichment: true });
  }

  function locateRankingItem(item: MapHotspot) {
    preserveRankingForViewport(1200);
    zoomToPoint(item.lng, item.lat, 10.5);
    openRegionHotspot(item);
    if (item.id >= 0) scheduleHotspotLoad("viewport");
  }

  function searchWorkspace() {
    const rawSearch = searchText.trim();
    if (!rawSearch) {
      setFilters((prev) => ({ ...prev, q: "" }));
      setLocatedTarget(null);
      setPendingSearchTarget(null);
      closeDetailsDrawer();
      setSearchMessage("已清除搜索筛选。");
      setMessage("已清除搜索筛选。");
      resetToGlobalView();
      scheduleHotspotLoad("viewport");
      return;
    }

    const target = findSearchTarget(rawSearch, searchTargets);
    if (target) {
      focusSearchTarget(target);
      setSearchMessage(`已定位到 ${target.label}，正在匹配该地区热点数据。`);
      setLocatedTarget(target);
      setPendingSearchTarget(target);
      setFilters((prev) => (prev.q ? { ...prev, q: "" } : prev));
      const hotspot = findHotspotForSearchTarget(target, displayHotspots);
      if (hotspot) {
        openRegionHotspot(hotspot);
        setSearchMessage(`已定位到 ${target.label}，已打开匹配热点。`);
        setPendingSearchTarget(null);
      }
      scheduleHotspotLoad("viewport");
      return;
    }

    if (rawSearch.length < 2) {
      setSearchMessage("搜索词至少需要 2 个字符。");
      setMessage("搜索词至少需要 2 个字符。");
      return;
    }

    resetToGlobalView();
    setLocatedTarget(null);
    setPendingSearchTarget(null);
    closeDetailsDrawer();
    setSearchMessage(`正在全局搜索「${rawSearch}」`);
    setFilters((prev) => {
      const next = { ...prev, q: rawSearch };
      if (prev.q === next.q) scheduleHotspotLoad("viewport");
      return next;
    });
  }

  function flagText(flag: string) {
    const labels: Record<string, string> = {
      same_title_repost: "同源转载",
      old_article: "旧文风险",
      missing_title: "缺少标题",
      missing_published_at: "缺发布时间",
      fetch_failed: "抓取失败",
      metadata_not_fetched: "未抓取元数据",
    };
    return labels[flag] ?? flag;
  }

  const baseMapTransform = `translate(${mapView.x} ${mapView.y}) scale(${mapView.k})`;
  const workspaceNotice = !databaseReady
    ? {
        title: "数据库暂不可用",
        body: "当前无法连接数据服务，地图会在恢复后自动显示真实热点。",
      }
    : !loading && hotspots.length === 0
      ? status.currentDataDate || filters.date
        ? {
            title: "当前范围暂无态势热点",
            body: message ?? "当前日期、话题、地区或地图范围没有匹配结果，可调整筛选或缩放地图。",
          }
        : {
            title: "暂无可展示数据",
            body: "当前日期或话题下没有可展示的地图热点。",
        }
      : null;
  const currentScopeText = filters.q ? `搜索「${filters.q}」` : "当前视野";
  const displayHotspotKeys = new Set(displayHotspots.map((hotspot) => `${hotspot.regionKey}:${hotspot.dataDate}`));
  const visibleResultMarkerCount = hotspotMarkers.filter((marker) => displayHotspotKeys.has(`${marker.hotspot.regionKey}:${marker.hotspot.dataDate}`)).length;
  const hiddenMarkerCount = Math.max(0, displayHotspots.length - visibleResultMarkerCount);
  const markerScopeText = filters.q ? "地图显示" : "当前视野显示";
  const markerItemText = filters.q ? "结果" : "热点";
  const markerCountText = hiddenMarkerCount > 0
    ? `${markerScopeText} ${visibleResultMarkerCount}/${displayHotspots.length} 个${markerItemText} · 已隐藏 ${hiddenMarkerCount} 个重叠${markerItemText}，放大查看`
    : `${markerScopeText} ${visibleResultMarkerCount}/${displayHotspots.length} 个${markerItemText}`;
  const mapOverlayText = mapLoadError
    ? mapLoadError
    : showDemoMode
      ? `演示数据 · 当前地图显示 ${hotspotMarkers.length}/${displayHotspots.length} 个示例热点`
    : loading && hotspots.length === 0
      ? "正在加载热点..."
      : `${loading ? "正在刷新热点..." : currentScopeText} · ${markerCountText}`;
  const latestDataDate = status.currentDataDate ?? status.latestSuccessfulImportDate ?? filters.date ?? "暂无";

  return (
    <>
      <section className="toolbar" aria-label="地图筛选">
        <div className="brand-block">
          <p className="eyebrow">全球态势热点</p>
          <h1>MapNews 全球态势地图</h1>
        </div>

        <DailyBriefCard
          brief={dailyBrief}
          loading={dailyBriefLoading}
          message={dailyBriefMessage}
          themeLabel={themeLabel}
          variant="toolbar"
        />

        <div className="latest-data-badge">
          <span>最新数据</span>
          <strong>{latestDataDate}</strong>
        </div>
      </section>

      <section className={`map-workspace ${selectedRegion ? "has-detail-drawer" : ""}`}>
        <aside className="control-panel" aria-label="全球态势热点工作台">
          <form
            className="sidebar-section sidebar-search-card"
            onSubmit={(event) => {
              event.preventDefault();
              searchWorkspace();
            }}
          >
            <div className="sidebar-filter-grid">
              <label className="sidebar-field">
                <span>日期</span>
                <select value={filters.date} onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}>
                  <option value="">最近可用</option>
                  {dates.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sidebar-field">
                <span>话题</span>
                <select
                  value={filters.channel}
                  onChange={(event) => setFilters((prev) => ({ ...prev, channel: event.target.value }))}
                >
                  <option value="">全部话题</option>
                  {channels.map((channel) => (
                    <option key={channel} value={channel}>
                      {themeLabel(channel)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="sidebar-search">
              <span>搜索</span>
              <span className="sidebar-search-row">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="输入地名定位地图，也可搜事件/参与方"
                />
                <button type="submit">搜索</button>
              </span>
            </label>
            {searchMessage ? <small>{searchMessage}</small> : null}
            {locatedTarget || filters.q ? (
              <div className="active-filter-chips" aria-label="已启用搜索状态">
                {locatedTarget ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLocatedTarget(null);
                      setPendingSearchTarget(null);
                      setSearchMessage("已清除定位状态。");
                    }}
                  >
                    定位: {locatedTarget.label} ×
                  </button>
                ) : null}
                {filters.q ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, q: "" }));
                      closeDetailsDrawer();
                      setSearchMessage("已清除全文搜索。");
                      scheduleHotspotLoad("viewport");
                    }}
                  >
                    搜索: {filters.q} ×
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          <div className="sidebar-section current-view-section">
            <p className="eyebrow">当前结果</p>
            <p>
              {currentScopeText} · {showDemoMode ? `演示 ${displayHotspots.length} 个热点` : `共 ${displayHotspots.length} 个热点`} · {markerCountText}
            </p>
          </div>

          {workspaceNotice ? (
            <div className="workspace-state">
              <strong>{workspaceNotice.title}</strong>
              <span>{workspaceNotice.body}</span>
            </div>
          ) : null}

          <RankingList
            items={displayRanking}
            maxHeat={maxRankingHeat}
            loading={loading}
            sortMode={resultSortMode}
            selectedRegionKey={selectedRegion?.regionKey ?? null}
            selectedDataDate={selectedRegion?.dataDate ?? null}
            onSortChange={setResultSortMode}
            onLocate={locateRankingItem}
            attitudeColor={goldsteinColor}
            formatGoldstein={formatGoldstein}
            themeLabel={themeLabel}
          />
        </aside>

        <MapRenderer
          mapRef={mapEl}
          mapReady={mapReady}
          mapLoadError={mapLoadError}
          size={size}
          dragging={dragging}
          baseMapTransform={baseMapTransform}
          countryPaths={countryPaths}
          regionPaths={regionPaths}
          mapLabels={mapLabels}
          hotspotMarkers={hotspotMarkers}
          hoveredMarker={hoveredMarker}
          mapOverlayText={mapOverlayText}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onZoomIn={() => zoomBy(1.45)}
          onZoomOut={() => zoomBy(1 / 1.45)}
          onResetView={handleResetMapView}
          onFitResults={fitCurrentResults}
          onHoverRegion={(markerKey) => {
            setHoveredRegionKey((current) => (markerKey === null && current === null ? current : markerKey));
          }}
          onOpenRegion={openRegionHotspot}
          trendClassName={trendClassName}
          themeLabel={themeLabel}
          formatGoldstein={formatGoldstein}
          goldsteinToneLabel={goldsteinToneLabel}
          formatHeatDelta={formatHeatDelta}
        />

        {selectedRegion ? (
          <DetailsDrawer
            region={selectedRegion}
            selected={selected}
            rank={selectedRegionRank}
            totalHotspots={displayHotspots.length}
            activeTab={detailTab}
            onTabChange={setDetailTab}
            regionTrend={regionTrend}
            regionTrendMessage={regionTrendMessage}
            onOpenChannelHotspot={openChannelHotspot}
            sourceLoading={sourceLoading}
            sourceMessage={sourceMessage}
            enrichmentState={selectedEnrichmentState}
            expandedStoryId={expandedStoryId}
            onToggleStory={(id) => setExpandedStoryId((current) => (current === id ? null : id))}
            hotspotNeedsEnrichment={hotspotNeedsEnrichment}
            channelColors={CHANNEL_COLORS}
            quadClassColors={QUAD_CLASS_COLORS}
            situationColor={situationColor}
            trendClassName={trendClassName}
            formatGoldstein={formatGoldstein}
            themeLabel={themeLabel}
            flagText={flagText}
          />
        ) : null}
      </section>
    </>
  );
}
