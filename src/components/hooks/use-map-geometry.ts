import { useMemo } from "react";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

export interface MapProperties {
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

export interface MapAssets {
  countries: FeatureCollection<Geometry, MapProperties>;
  regions: FeatureCollection<Geometry, MapProperties>;
  places: FeatureCollection<Point, MapProperties>;
}

export interface MapSize {
  width: number;
  height: number;
}

export interface MapView {
  x: number;
  y: number;
  k: number;
}

export interface MapBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MapPathView {
  key: string;
  label: string;
  d: string;
  feature: Feature<Geometry, MapProperties>;
  labelrank: number;
}

export interface RegionPathView extends MapPathView {
  bounds: [[number, number], [number, number]];
}

export interface MapLabelView {
  key: string;
  label: string;
  x: number;
  y: number;
  kind: "country" | "region" | "place";
}

const REGION_BOUNDARY_ZOOM = 2.8;
const COUNTRY_LABEL_MAX_ZOOM = 3.1;
const REGION_LABEL_MIN_ZOOM = 3.4;
const REGION_LABEL_MAX_ZOOM = 6.4;
const PLACE_LABEL_ZOOM = 5.1;

export function labelFor(properties: MapProperties) {
  return properties.name_zh || properties.name_en || properties.name_ascii || properties.name || "未命名地区";
}

export function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    const point = projection?.([lng, lat]);
    if (!point) return null;
    return [point[0] * view.k + view.x, point[1] * view.k + view.y] as [number, number];
  } catch {
    return null;
  }
}

function isScreenVisible(point: [number, number] | null, size: MapSize, margin = 40) {
  if (!point) return false;
  return point[0] >= -margin && point[0] <= size.width + margin && point[1] >= -margin && point[1] <= size.height + margin;
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

export function useMapGeometry(assets: MapAssets | null, size: MapSize, mapView: MapView) {
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

  const mapContentBounds = useMemo((): MapBounds | null => {
    if (!assets || !path) return null;
    const [[x0, y0], [x1, y1]] = path.bounds(assets.countries as GeoPermissibleObjects);
    return { x0, y0, x1, y1 };
  }, [assets, path]);

  const countryPaths = useMemo((): MapPathView[] => {
    if (!assets || !path) return [];
    return assets.countries.features.map((feature, index) => ({
      key: featureKey(feature, "country", index),
      label: labelFor(feature.properties ?? {}),
      d: path(feature as GeoPermissibleObjects) ?? "",
      feature,
      labelrank: numberValue(feature.properties?.labelrank),
    }));
  }, [assets, path]);

  const allRegionPaths = useMemo((): RegionPathView[] => {
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

  const regionPaths = useMemo((): RegionPathView[] => {
    if (mapView.k < REGION_BOUNDARY_ZOOM) return [];
    return allRegionPaths.filter((item) => isProjectedBoundsVisible(item.bounds, mapView, size));
  }, [allRegionPaths, mapView, size]);

  const mapLabels = useMemo((): MapLabelView[] => {
    if (!assets || !projection) return [];
    const labels: MapLabelView[] = [];

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
          const point = projection?.([lng, lat]);
          const screenPoint = point ? ([point[0] * mapView.k + mapView.x, point[1] * mapView.k + mapView.y] as [number, number]) : null;
          return {
            key: `place-label-${countryCode}-${name}-${lng.toFixed(3)}-${lat.toFixed(3)}-${index}`,
            label: labelFor(feature.properties ?? {}),
            point: screenPoint,
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

  return {
    projection,
    path,
    mapContentBounds,
    countryPaths,
    allRegionPaths,
    regionPaths,
    mapLabels,
  };
}
