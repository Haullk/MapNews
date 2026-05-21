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
import { geoBounds, geoCentroid, geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import type { DataStatus, DailyBrief, HotspotDetail, MapHotspot } from "@/lib/hotspots";

interface NewsMapProps {
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

interface MapProperties {
  id?: string;
  name?: string;
  name_ascii?: string;
  name_en?: string;
  name_zh?: string;
  admin?: string;
  country?: string;
  country_code?: string;
  continent?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  population?: number;
  labelrank?: number;
  min_zoom?: number;
  capital?: number;
  worldcity?: number;
  megacity?: number;
}

interface MapAssets {
  countries: FeatureCollection<Geometry, MapProperties>;
  regions: FeatureCollection<Geometry, MapProperties>;
  places: FeatureCollection<Point, MapProperties>;
}

interface MapSize {
  width: number;
  height: number;
}

interface MapView {
  x: number;
  y: number;
  k: number;
}

interface MapBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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

type HotspotsPayload = { hotspots: MapHotspot[]; status: { message: string; ok: boolean } };
type LoadMode = "full" | "hotspots" | "viewport";
type PanelView = "ranking" | "detail";
type EnrichmentState = {
  hotspotId: number;
  status: "running" | "success" | "error";
  message: string;
};
type HotspotChannelSegment = {
  channel: string;
  color: string;
  path: string;
  share: number;
};
type HotspotMarker = {
  hotspot: MapHotspot;
  x: number;
  y: number;
  color: string;
  sizePx: number;
  label: string;
  ringRadius: number;
  segments: HotspotChannelSegment[];
  channelSummary: string;
  heatIntensity: number;
  collisionRadius: number;
  selected: boolean;
};

const MAP_VIEW_MIN_ZOOM = 1;
const MAP_VIEW_MAX_ZOOM = 40;
const REGION_BOUNDARY_ZOOM = 2.8;
const COUNTRY_LABEL_MAX_ZOOM = 3.1;
const REGION_LABEL_MIN_ZOOM = 3.4;
const REGION_LABEL_MAX_ZOOM = 6.4;
const PLACE_LABEL_ZOOM = 5.1;

const CHANNEL_COLORS: Record<string, string> = {
  国际: "#0f8f7f",
  冲突: "#bc3f32",
  政治: "#4b6fb5",
  经济: "#b98221",
  灾害: "#7d4aa8",
  社会: "#52606d",
};

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

function labelFor(properties: MapProperties) {
  return properties.name_zh || properties.name_en || properties.name_ascii || properties.name || "未命名地区";
}

function queryNameFor(properties: MapProperties) {
  const countryCode = properties.id || properties.country_code || "";
  return COUNTRY_QUERY_NAMES[countryCode] || properties.name_en || properties.name_ascii || properties.name || labelFor(properties);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function pointOnCircle(radius: number, angle: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function arcPath(radius: number, startAngle: number, endAngle: number) {
  const start = pointOnCircle(radius, startAngle);
  const end = pointOnCircle(radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function channelSegments(
  breakdown: MapHotspot["channelBreakdown"],
  totalHeatScore: number,
  ringRadius: number,
): HotspotChannelSegment[] {
  const orderedChannels = [...breakdown].sort((a, b) => b.heatScore - a.heatScore);
  const positiveHeatTotal = orderedChannels.reduce((sum, item) => sum + Math.max(0, item.heatScore), 0);
  const totalHeat = positiveHeatTotal || Math.max(0, totalHeatScore);
  if (orderedChannels.length === 0 || totalHeat <= 0) return [];
  if (orderedChannels.length === 1) {
    const channel = orderedChannels[0];
    return [
      {
        channel: channel.channel,
        color: CHANNEL_COLORS[channel.channel] ?? "#0f8f7f",
        path: "",
        share: 1,
      },
    ];
  }

  const gapAngle = 0.04;
  const availableAngle = Math.PI * 2 - gapAngle * orderedChannels.length;
  let startAngle = -Math.PI / 2;
  return orderedChannels.map((channel) => {
    const share = Math.max(0, channel.heatScore) / totalHeat;
    const endAngle = startAngle + availableAngle * share;
    const segment = {
      channel: channel.channel,
      color: CHANNEL_COLORS[channel.channel] ?? "#0f8f7f",
      path: arcPath(ringRadius, startAngle, endAngle),
      share,
    };
    startAngle = endAngle + gapAngle;
    return segment;
  });
}

function declutterHotspotMarkers(markers: HotspotMarker[], zoom: number) {
  const maxVisible = hotspotLimitForZoom(zoom);
  const spacing = hotspotSpacingForZoom(zoom);
  const selected = markers.find((marker) => marker.selected);
  const kept: HotspotMarker[] = [];
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

function featureKey(feature: Feature<Geometry, MapProperties>, prefix: string, index: number) {
  return `${prefix}-${feature.properties?.id ?? feature.properties?.name_en ?? feature.properties?.name ?? index}`;
}

function featureLabelPosition(
  projection: GeoProjection | null,
  view: MapView,
  feature: Feature<Geometry, MapProperties>,
) {
  try {
    const [lng, lat] = geoCentroid(feature as GeoPermissibleObjects);
    return screenPoint(projection, view, lng, lat);
  } catch {
    return null;
  }
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

function isProjectedBoundsVisible(bounds: [[number, number], [number, number]], view: MapView, size: MapSize, margin = 80) {
  const x0 = bounds[0][0] * view.k + view.x;
  const y0 = bounds[0][1] * view.k + view.y;
  const x1 = bounds[1][0] * view.k + view.x;
  const y1 = bounds[1][1] * view.k + view.y;
  return Math.max(x0, x1) >= -margin && Math.min(x0, x1) <= size.width + margin &&
    Math.max(y0, y1) >= -margin && Math.min(y0, y1) <= size.height + margin;
}

function keepSeparatedLabels<T extends { point: [number, number] | null }>(items: T[], minDistance: number, limit: number) {
  const kept: T[] = [];
  const minDistanceSquared = minDistance * minDistance;
  for (const item of items) {
    const point = item.point;
    if (!point) continue;
    const overlaps = kept.some((keptItem) => {
      const keptPoint = keptItem.point;
      if (!keptPoint) return false;
      const dx = point[0] - keptPoint[0];
      const dy = point[1] - keptPoint[1];
      return dx * dx + dy * dy < minDistanceSquared;
    });
    if (!overlaps) kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
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

export function NewsMap({ dates, channels, databaseReady, initialStatus }: NewsMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const preserveRankingUntilRef = useRef(0);
  const enrichmentPollRef = useRef<Map<number, boolean>>(new Map());
  const initialLoadRef = useRef(false);
  const loadWorkspaceRef = useRef<(mode?: LoadMode) => void>(() => undefined);
  const briefCacheRef = useRef<Map<string, DailyBrief>>(new Map());
  const statusCacheRef = useRef<DataStatus | null>(initialStatus);
  const previousFiltersRef = useRef<Filters | null>(null);
  const projectionRef = useRef<GeoProjection | null>(null);
  const mapBoundsRef = useRef<MapBounds | null>(null);
  const sizeRef = useRef<MapSize>({ width: 0, height: 0 });
  const mapViewRef = useRef<MapView>({ x: 0, y: 0, k: 1 });
  const pendingMapViewRef = useRef<MapView | null>(null);
  const mapFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const previousViewportRef = useRef<string | null>(null);

  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [size, setSize] = useState<MapSize>({ width: 0, height: 0 });
  const [mapView, setMapViewState] = useState<MapView>({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const [hotspots, setHotspots] = useState<MapHotspot[]>([]);
  const [ranking, setRanking] = useState<MapHotspot[]>([]);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapHotspot | null>(null);
  const [selected, setSelected] = useState<HotspotDetail | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<number | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("ranking");
  const [enrichmentState, setEnrichmentState] = useState<EnrichmentState | null>(null);
  const [status, setStatus] = useState<DataStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ date: dates[0] ?? "", channel: "", region: "" });

  const projection = useMemo(() => {
    if (!assets || size.width <= 0 || size.height <= 0) return null;
    return geoMercator().fitExtent(
      [
        [28, 24],
        [size.width - 28, size.height - 24],
      ],
      assets.countries as GeoPermissibleObjects,
    );
  }, [assets, size]);

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const mapContentBounds = useMemo(() => {
    if (!assets || !path) return null;
    const [[x0, y0], [x1, y1]] = path.bounds(assets.countries as GeoPermissibleObjects);
    return { x0, y0, x1, y1 };
  }, [assets, path]);
  const mapReady = Boolean(assets && projection && size.width > 0 && size.height > 0);
  const selectedRegionKey = selectedRegion ? `${selectedRegion.dataDate}-${selectedRegion.regionKey}` : null;
  const candidateHotspots = useMemo(() => {
    const limit = hotspotCandidateLimitForZoom(mapView.k, hotspots.length);
    const candidates = hotspots.slice(0, limit);
    if (selectedRegion && !candidates.some((hotspot) => hotspot.regionKey === selectedRegion.regionKey && hotspot.dataDate === selectedRegion.dataDate)) {
      candidates.push(selectedRegion);
    }
    return candidates;
  }, [hotspots, mapView.k, selectedRegion]);
  const hotspotHeatScale = useMemo(() => {
    const values = hotspots
      .map((hotspot) => hotspot.heatScore)
      .filter((heatScore) => Number.isFinite(heatScore) && heatScore > 0)
      .sort((a, b) => a - b);
    return {
      low: quantile(values, 0.5),
      high: quantile(values, 0.95),
    };
  }, [hotspots]);
  const maxRankingHeat = Math.max(...ranking.map((item) => item.heatScore), 1);
  const selectedRegionMaxChannelHeat = Math.max(
    ...(selectedRegion?.channelBreakdown.map((item) => item.heatScore) ?? []),
    1,
  );
  const selectedEnrichmentState =
    selected && enrichmentState?.hotspotId === selected.id ? enrichmentState : null;
  const searchTargets = useMemo(() => buildSearchTargets(assets), [assets]);

  const countryPaths = useMemo(() => {
    if (!assets || !path) return [];
    return assets.countries.features.map((feature, index) => ({
      key: featureKey(feature, "country", index),
      label: labelFor(feature.properties ?? {}),
      d: path(feature as GeoPermissibleObjects) ?? "",
      feature,
      labelrank: numberValue(feature.properties?.labelrank),
    }));
  }, [assets, path]);

  const allRegionPaths = useMemo(() => {
    if (!assets || !path) return [];
    return assets.regions.features.map((feature, index) => {
      const permissibleFeature = feature as GeoPermissibleObjects;
      return {
        key: featureKey(feature, "region", index),
        label: labelFor(feature.properties ?? {}),
        d: path(permissibleFeature) ?? "",
        bounds: path.bounds(permissibleFeature) as [[number, number], [number, number]],
        feature,
        labelrank: numberValue(feature.properties?.labelrank),
      };
    });
  }, [assets, path]);

  const regionPaths = useMemo(() => {
    if (mapView.k < REGION_BOUNDARY_ZOOM) return [];
    return allRegionPaths.filter((item) => isProjectedBoundsVisible(item.bounds, mapView, size));
  }, [allRegionPaths, mapView, size]);

  const mapLabels = useMemo(() => {
    if (!assets || !projection) return [];
    const labels: Array<{ key: string; label: string; x: number; y: number; kind: "country" | "region" | "place" }> = [];

    if (mapView.k < COUNTRY_LABEL_MAX_ZOOM) {
      const countryLabelRank = mapView.k < 1.7 ? 2 : 3;
      const countryLimit = mapView.k < 1.7 ? 18 : 28;
      const countryCandidates = countryPaths
        .filter((item) => item.labelrank <= countryLabelRank)
        .map((item) => ({
          key: `label-${item.key}`,
          label: item.label,
          point: featureLabelPosition(projection, mapView, item.feature),
          rank: item.labelrank,
        }))
        .filter((item) => isScreenVisible(item.point, size))
        .sort((a, b) => a.rank - b.rank);
      for (const item of keepSeparatedLabels(countryCandidates, 78, countryLimit)) {
        labels.push({ key: item.key, label: item.label, x: item.point![0], y: item.point![1], kind: "country" });
      }
    }

    if (mapView.k >= REGION_LABEL_MIN_ZOOM && mapView.k < REGION_LABEL_MAX_ZOOM) {
      const regionCandidates = assets.regions.features
        .filter((feature) => numberValue(feature.properties?.labelrank) <= 3)
        .map((feature, index) => {
          const point = featureLabelPosition(projection, mapView, feature);
          return {
            key: `region-label-${feature.properties?.id ?? index}`,
            label: labelFor(feature.properties ?? {}),
            point,
            rank: numberValue(feature.properties?.labelrank),
          };
        })
        .filter((item) => isScreenVisible(item.point, size, 20))
        .sort((a, b) => a.rank - b.rank);
      for (const item of keepSeparatedLabels(regionCandidates, 62, 24)) {
        labels.push({ key: item.key, label: item.label, x: item.point![0], y: item.point![1], kind: "region" });
      }
    }

    if (mapView.k >= PLACE_LABEL_ZOOM) {
      const placeLimit = mapView.k >= 12 ? 75 : mapView.k >= 8 ? 52 : 30;
      const placeMinPopulation = mapView.k >= 12 ? 500_000 : mapView.k >= 8 ? 1_000_000 : 4_000_000;
      const placeCandidates = assets.places.features
        .filter((feature) => {
          const properties = feature.properties ?? {};
          return (
            numberValue(properties.capital) === 1 ||
            numberValue(properties.worldcity) === 1 ||
            numberValue(properties.megacity) === 1 ||
            numberValue(properties.population) >= placeMinPopulation
          );
        })
        .map((feature, index) => {
          const [lng, lat] = feature.geometry.coordinates;
          const countryCode = feature.properties?.country_code ?? "unknown";
          const name = feature.properties?.name_ascii ?? feature.properties?.name_en ?? feature.properties?.name ?? index;
          const point = screenPoint(projection, mapView, lng, lat);
          return {
            key: `place-label-${countryCode}-${name}-${lng.toFixed(3)}-${lat.toFixed(3)}-${index}`,
            label: labelFor(feature.properties ?? {}),
            point,
            population: numberValue(feature.properties?.population),
          };
        })
        .filter((item) => isScreenVisible(item.point, size, 18))
        .sort((a, b) => b.population - a.population);
      for (const item of keepSeparatedLabels(placeCandidates, mapView.k >= 10 ? 48 : 58, placeLimit)) {
        labels.push({ key: item.key, label: item.label, x: item.point![0], y: item.point![1], kind: "place" });
      }
    }

    return labels;
  }, [assets, countryPaths, mapView, projection, size]);

  const hotspotMarkers = useMemo(() => {
    if (!projection) return [];
    const candidateMarkers = candidateHotspots
      .map((hotspot) => {
        const point = screenPoint(projection, mapView, hotspot.lng, hotspot.lat);
        if (!isScreenVisible(point, size, 18)) return null;
        const color = CHANNEL_COLORS[hotspot.channel] ?? "#0f8f7f";
        const heatIntensity = heatIntensityFor(hotspot.heatScore, hotspotHeatScale.low, hotspotHeatScale.high);
        const sizePx = markerSizeForHeat(hotspot.heatScore, hotspotHeatScale.low, hotspotHeatScale.high);
        const ringRadius = sizePx / 2 + 5;
        const segments = channelSegments(hotspot.channelBreakdown, hotspot.heatScore, ringRadius);
        const label = hotspot.channel.slice(0, 1);
        const channelSummary = hotspot.channelBreakdown
          .slice(0, 4)
          .map((item) => `${item.channel}${Math.round((item.heatScore / Math.max(hotspot.heatScore, 1)) * 100)}%`)
          .join("、");
        const markerKey = `${hotspot.dataDate}-${hotspot.regionKey}`;
        return {
          hotspot,
          x: point![0],
          y: point![1],
          color,
          sizePx,
          label,
          ringRadius,
          segments,
          channelSummary,
          heatIntensity,
          collisionRadius: sizePx / 2 + 6 + heatIntensity * 2,
          selected: markerKey === selectedRegionKey,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return declutterHotspotMarkers(candidateMarkers, mapView.k);
  }, [candidateHotspots, hotspotHeatScale, mapView, projection, selectedRegionKey, size]);

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

  const queryParams = useCallback(
    (withBounds: boolean) => {
      const params = new URLSearchParams();
      if (filters.date) params.set("date", filters.date);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.region) params.set("region", filters.region);
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
    [filters],
  );

  const briefParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.date) params.set("date", filters.date);
    return params;
  }, [filters.date]);

  const loadWorkspace = useCallback(async (mode: LoadMode = "full") => {
    if (!databaseReady || !mapReady) return;
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const hotspotResponse = await fetch(`/api/hotspots?${queryParams(true).toString()}`, {
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
  }, [briefParams, databaseReady, filters.date, mapReady, queryParams]);

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

  useEffect(() => {
    if (!mapReady || initialLoadRef.current) return;
    initialLoadRef.current = true;
    previousViewportRef.current = viewportKey(projectionRef.current, mapViewRef.current, sizeRef.current);
    loadWorkspace("full");
  }, [loadWorkspace, mapReady]);

  useEffect(() => {
    if (!databaseReady || !mapReady || !initialLoadRef.current) return;
    const key = viewportKey(projectionRef.current, mapViewRef.current, sizeRef.current);
    if (!key || key === previousViewportRef.current) return;
    previousViewportRef.current = key;
    scheduleHotspotLoad();
  }, [databaseReady, mapReady, mapView, scheduleHotspotLoad, size]);

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

  function zoomToPoint(lng: number, lat: number, zoom: number) {
    const point = projection?.([lng, lat]);
    if (!point || size.width <= 0 || size.height <= 0) return;
    setMapView({
      k: clamp(zoom, MAP_VIEW_MIN_ZOOM, MAP_VIEW_MAX_ZOOM),
      x: size.width / 2 - point[0] * zoom,
      y: size.height / 2 - point[1] * zoom,
    });
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

  function focusSearchTarget(target: SearchTarget) {
    if (target.feature) {
      fitFeature(target.feature, target.type === "country" ? 4.2 : 9.5);
      return;
    }
    if (typeof target.lng === "number" && typeof target.lat === "number") {
      zoomToPoint(target.lng, target.lat, target.type === "place" ? 12 : 9);
    }
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
    scheduleHotspotLoad();
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !mapReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
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
    if (drag.moved) scheduleHotspotLoad();
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

  function openRegionHotspot(hotspot: MapHotspot) {
    setSelectedRegion(hotspot);
    setSelected(null);
    setExpandedStoryId(null);
    setEnrichmentState(null);
    setPanelView("detail");
  }

  async function openChannelHotspot(id: number) {
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
    zoomToPoint(item.lng, item.lat, 10.5);
    openRegionHotspot(item);
    scheduleHotspotLoad();
  }

  function searchRegion() {
    const rawSearch = searchText.trim();
    if (!rawSearch) {
      setFilters((prev) => ({ ...prev, region: "" }));
      setSearchMessage(null);
      setMessage("已清除地区筛选。");
      scheduleHotspotLoad();
      return;
    }

    const target = findSearchTarget(rawSearch, searchTargets);
    if (!target) {
      setSearchMessage("未找到地区，可尝试英文/中文地名。");
      return;
    }

    focusSearchTarget(target);
    setSearchMessage(`已定位到 ${target.label}`);
    setFilters((prev) => {
      const next = { ...prev, region: target.queryName };
      if (prev.region === next.region) scheduleHotspotLoad();
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
      gkg_missing: "主题缺失",
    };
    return labels[flag] ?? flag;
  }

  const baseMapTransform = `translate(${mapView.x} ${mapView.y}) scale(${mapView.k})`;
  const mapOverlayText = mapLoadError
    ? mapLoadError
    : loading
      ? "正在加载热点..."
      : `${message ?? status.message} · 当前地图显示 ${hotspotMarkers.length}/${hotspots.length} 个热点`;

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
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    searchRegion();
                  }
                }}
                placeholder="国家、省州、城市"
              />
              <button type="button" onClick={searchRegion}>
                搜索
              </button>
            </span>
            {searchMessage ? <span className="map-search-message">{searchMessage}</span> : null}
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
            disabled={!selectedRegion && !selected}
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
                地图显示 {hotspotMarkers.length}/{hotspots.length}
              </span>
            </div>
            <div className="ranking-list">
              {ranking.map((item) => (
                <button key={item.id} type="button" className="ranking-item" onClick={() => locateRankingItem(item)}>
                  <span>{item.regionName}</span>
                  <strong>{item.channelCount > 1 ? `${item.channel}主导 · ${item.channelCount}频道` : item.channel}</strong>
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
        ) : selectedRegion ? (
          <article className="detail-panel">
            <div className="detail-hero region-detail-hero">
              <p className="eyebrow">地区综合热点</p>
              <h2>{selectedRegion.regionName}</h2>
              <p className="detail-summary">{selectedRegion.summary}</p>
              <div className="detail-metrics">
                <span>综合热度 {selectedRegion.heatScore.toFixed(1)}</span>
                <span>{selectedRegion.eventCount} 个事件</span>
                <span>{selectedRegion.mentionCount} 次提及</span>
                <span>{selectedRegion.sourceCount} 个来源</span>
                <span>主频道 {selectedRegion.channel}</span>
                <span>{selectedRegion.channelCount} 个频道</span>
              </div>
            </div>

            <section className="detail-section">
              <p className="eyebrow">频道构成</p>
              <div className="channel-breakdown-list">
                {selectedRegion.channelBreakdown.map((item) => {
                  const color = CHANNEL_COLORS[item.channel] ?? "#0f8f7f";
                  return (
                    <button
                      key={item.hotspotId}
                      type="button"
                      className={`channel-breakdown-item ${selected?.id === item.hotspotId ? "active" : ""}`}
                      style={{ "--channel-color": color } as React.CSSProperties}
                      onClick={() => void openChannelHotspot(item.hotspotId)}
                    >
                      <span>
                        <i />
                        {item.channel}
                      </span>
                      <strong>{item.heatScore.toFixed(1)}</strong>
                      <small>
                        {item.eventCount} 个事件 · {item.mentionCount} 次提及 · {item.sourceCount} 个来源
                      </small>
                      <em className="heat-bar">
                        <b style={{ width: `${Math.max(8, Math.round((item.heatScore / selectedRegionMaxChannelHeat) * 100))}%` }} />
                      </em>
                    </button>
                  );
                })}
              </div>
            </section>

            {selected ? (
              <>
            <div className="detail-hero channel-detail-hero">
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
              </>
            ) : (
              <div className="empty-detail channel-detail-empty">选择一个频道查看代表来源、故事组和来源质量。</div>
            )}
          </article>
        ) : (
          <div className="empty-detail">点击地图热点或排行项查看基础详情。</div>
        )}
      </aside>

      <div className="map-stage" ref={mapEl}>
        {mapReady ? (
          <svg
            className={`map-canvas ${dragging ? "dragging" : ""}`}
            role="img"
            aria-label="全球新闻热点地图"
            viewBox={`0 0 ${size.width} ${size.height}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <rect className="map-ocean" width={size.width} height={size.height} />
            <g className="map-base-layer" transform={baseMapTransform}>
              {countryPaths.map((item) => (
                <path key={item.key} className="map-country" d={item.d} />
              ))}
              {regionPaths.map((item) => (
                <path key={item.key} className="map-region" d={item.d} />
              ))}
            </g>
            <g className="map-label-layer" aria-hidden="true">
              {mapLabels.map((label) => (
                <text key={label.key} className={`map-label ${label.kind}`} x={label.x} y={label.y}>
                  {label.label}
                </text>
              ))}
            </g>
            <g className="hotspot-layer">
              {hotspotMarkers.map(({ hotspot, x, y, color, sizePx, label, ringRadius, segments, channelSummary, heatIntensity, selected }) => (
                <g
                  key={`${hotspot.dataDate}-${hotspot.regionKey}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${hotspot.regionName} 地区综合热点，${hotspot.channel}主导，覆盖 ${hotspot.channelCount} 个频道。${channelSummary}`}
                  className={`hotspot-dot ${selected ? "selected" : ""}`}
                  transform={`translate(${x} ${y})`}
                  style={{ "--marker-color": color, "--marker-size": `${sizePx}px` } as React.CSSProperties}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => openRegionHotspot(hotspot)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRegionHotspot(hotspot);
                    }
                  }}
                >
                  <title>{hotspot.summary}</title>
                  <circle className="hotspot-hit-area" r={Math.max(28, ringRadius + 8)} />
                  <circle
                    className="hotspot-heat-glow"
                    r={ringRadius + 9 + heatIntensity * 18}
                    opacity={0.12 + heatIntensity * 0.2}
                  />
                  <circle className="hotspot-halo" r={ringRadius + 6} />
                  {segments.map((segment) =>
                    segment.path ? (
                      <path
                        key={segment.channel}
                        className="hotspot-channel-ring"
                        d={segment.path}
                        stroke={segment.color}
                      />
                    ) : (
                      <circle
                        key={segment.channel}
                        className="hotspot-channel-ring"
                        r={ringRadius}
                        stroke={segment.color}
                      />
                    ),
                  )}
                  <circle className="hotspot-core" r={sizePx / 2} />
                  <text>{label}</text>
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div className="map-placeholder">{mapLoadError ?? "正在加载本地地图。"}</div>
        )}
        <div className="map-overlay">{mapOverlayText}</div>
        <div className="map-attribution">Natural Earth · 本地 GeoJSON</div>
      </div>
    </section>
  );
}
