import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  type CSSProperties,
} from "react";
import type { MapHotspot } from "@/lib/hotspots";
import { HotspotLayer, type HotspotMarkerView } from "./hotspot-layer";

interface MapSize {
  width: number;
  height: number;
}

interface MapPathView {
  key: string;
  d: string;
}

interface MapLabelView {
  key: string;
  label: string;
  x: number;
  y: number;
  kind: "country" | "region" | "place";
}

interface MapRendererProps {
  mapRef: RefObject<HTMLDivElement | null>;
  mapReady: boolean;
  mapLoadError: string | null;
  size: MapSize;
  dragging: boolean;
  baseMapTransform: string;
  countryPaths: MapPathView[];
  regionPaths: MapPathView[];
  mapLabels: MapLabelView[];
  hotspotMarkers: HotspotMarkerView[];
  hoveredMarker: HotspotMarkerView | null;
  mapOverlayText: string;
  onWheel: (event: ReactWheelEvent<SVGSVGElement>) => void;
  onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onHoverRegion: (markerKey: string | null) => void;
  onOpenRegion: (hotspot: MapHotspot) => void;
  trendClassName: (trendLabel: string) => string;
  themeLabel: (channel: string) => string;
  formatGoldstein: (value: number | null) => string;
  goldsteinToneLabel: (value: number | null) => string;
  formatHeatDelta: (value: number | null) => string;
  quadClassColors: Record<number, string>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function MapRenderer({
  mapRef,
  mapReady,
  mapLoadError,
  size,
  dragging,
  baseMapTransform,
  countryPaths,
  regionPaths,
  mapLabels,
  hotspotMarkers,
  hoveredMarker,
  mapOverlayText,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHoverRegion,
  onOpenRegion,
  trendClassName,
  themeLabel,
  formatGoldstein,
  goldsteinToneLabel,
  formatHeatDelta,
  quadClassColors,
}: MapRendererProps) {
  return (
    <div className="map-stage" ref={mapRef}>
      {mapReady ? (
        <svg
          className={`map-canvas ${dragging ? "dragging" : ""}`}
          role="img"
          aria-label="全球态势热点地图"
          viewBox={`0 0 ${size.width} ${size.height}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
          <HotspotLayer
            markers={hotspotMarkers}
            onHoverRegion={onHoverRegion}
            onOpenRegion={onOpenRegion}
            trendClassName={trendClassName}
            themeLabel={themeLabel}
          />
        </svg>
      ) : (
        <div className="map-placeholder">{mapLoadError ?? "正在加载本地地图。"}</div>
      )}
      {hoveredMarker ? (
        <div
          className="hotspot-hover-card"
          style={{
            left: `${clamp(hoveredMarker.x + 16, 12, Math.max(12, size.width - 302))}px`,
            top: `${clamp(hoveredMarker.y - 112, 12, Math.max(12, size.height - 220))}px`,
            "--situation-color": hoveredMarker.color,
          } as CSSProperties}
        >
          <strong>{hoveredMarker.hotspot.regionName}</strong>
          <span>
            <i />
            GDELT {formatGoldstein(hoveredMarker.hotspot.weightedGoldstein)} · {goldsteinToneLabel(hoveredMarker.hotspot.weightedGoldstein)}
          </span>
          <small>
            主导象限 {hoveredMarker.hotspot.quadClassLabel} · {hoveredMarker.hotspot.trendLabel}
          </small>
          {hoveredMarker.hotspot.quadClassBreakdown.length ? (
            <div className="hover-quad-list" aria-label="QuadClass 四象限占比">
              {hoveredMarker.hotspot.quadClassBreakdown.map((item) => (
                <span
                  key={item.quadClass}
                  className="hover-quad-row"
                  style={{ "--situation-color": quadClassColors[item.quadClass] ?? "#64748b" } as CSSProperties}
                >
                  <em>{item.label}</em>
                  <b>{Math.round(item.share * 100)}%</b>
                  <i style={{ width: `${Math.max(4, Math.round(item.share * 100))}%` }} />
                </span>
              ))}
            </div>
          ) : null}
          <small>
            热度 {hoveredMarker.hotspot.heatScore.toFixed(1)} · {hoveredMarker.hotspot.eventCount} 事件 · {hoveredMarker.hotspot.sourceCount} 来源
          </small>
          <small>
            较昨日 {formatHeatDelta(hoveredMarker.hotspot.heatDelta)} · {themeLabel(hoveredMarker.hotspot.channel)}
          </small>
        </div>
      ) : null}
      <div className="goldstein-legend" aria-label="GDELT 态势倾向图例">
        <span>GDELT 态势倾向</span>
        <i />
        <div>
          <b>冲突 -10</b>
          <b>中性 0</b>
          <b>合作 +10</b>
        </div>
        <small>事件信号聚合，不等同于现实世界结论</small>
      </div>
      <div className="map-overlay">{mapOverlayText}</div>
      <div className="map-attribution">Natural Earth · 本地 GeoJSON</div>
    </div>
  );
}
