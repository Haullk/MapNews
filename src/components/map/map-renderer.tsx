import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  type CSSProperties,
  useState,
} from "react";
import type { MapHotspot } from "@/lib/hotspots";
import { AttitudeIndicator } from "@/components/shared/attitude-indicator";
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
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitResults: () => void;
  onHoverRegion: (markerKey: string | null) => void;
  onOpenRegion: (hotspot: MapHotspot) => void;
  trendClassName: (trendLabel: string) => string;
  themeLabel: (channel: string) => string;
  formatGoldstein: (value: number | null) => string;
  goldsteinToneLabel: (value: number | null) => string;
  formatHeatDelta: (value: number | null) => string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return Math.round(value).toLocaleString("zh-CN");
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
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitResults,
  onHoverRegion,
  onOpenRegion,
  trendClassName,
  themeLabel,
  formatGoldstein,
  goldsteinToneLabel,
  formatHeatDelta,
}: MapRendererProps) {
  const [legendOpen, setLegendOpen] = useState(true);

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
          <rect className="map-click-catcher" width={size.width} height={size.height} />
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
          <div className="hover-metric-grid">
            <span>
              <em>综合热度</em>
              <b>{formatCompactNumber(hoveredMarker.hotspot.heatScore)}</b>
            </span>
            <span>
              <em>来源</em>
              <b>{formatCompactNumber(hoveredMarker.hotspot.sourceCount)}</b>
            </span>
          </div>
          <AttitudeIndicator
            value={hoveredMarker.hotspot.weightedGoldstein}
            valueText={formatGoldstein(hoveredMarker.hotspot.weightedGoldstein)}
            toneText={goldsteinToneLabel(hoveredMarker.hotspot.weightedGoldstein)}
            compact
          />
          <div className="hover-footer-row">
            <span>{themeLabel(hoveredMarker.hotspot.channel)}</span>
            <span>{hoveredMarker.hotspot.trendLabel}</span>
            <span>{hoveredMarker.hotspot.eventCount} 个事件信号</span>
          </div>
          <small>较昨日 {formatHeatDelta(hoveredMarker.hotspot.heatDelta)} · 点击查看热点详情</small>
        </div>
      ) : null}
      <div className="map-controls" aria-label="地图控制">
        <button type="button" onClick={onZoomIn} aria-label="放大地图">+</button>
        <button type="button" onClick={onZoomOut} aria-label="缩小地图">-</button>
        <button type="button" onClick={onResetView}>全球</button>
        <button type="button" onClick={onFitResults}>适配</button>
      </div>
      <div className={`goldstein-legend ${legendOpen ? "" : "collapsed"}`} aria-label="态势倾向图例">
        <button
          className="legend-toggle"
          type="button"
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((current) => !current)}
        >
          态势倾向
        </button>
        {legendOpen ? (
          <>
            <i />
            <div>
              <b>冲突倾向</b>
              <b>中性混合</b>
              <b>合作倾向</b>
            </div>
            <small>基于公开报道信号聚合，不等同于现实世界结论</small>
          </>
        ) : null}
      </div>
      <div className="map-overlay">{mapOverlayText}</div>
      <div className="map-attribution">Natural Earth · 本地 GeoJSON</div>
    </div>
  );
}
