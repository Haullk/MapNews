import type { CSSProperties } from "react";
import type { MapHotspot } from "@/lib/hotspots";

export type HotspotMarkerView = {
  markerKey: string;
  hotspot: MapHotspot;
  x: number;
  y: number;
  color: string;
  sizePx: number;
  ringRadius: number;
  themeSummary: string;
  goldsteinText: string;
  heatIntensity: number;
  trendGlowRadius: number;
  trendGlowOpacity: number;
  collisionRadius: number;
  selected: boolean;
  hovered: boolean;
};

interface HotspotLayerProps {
  markers: HotspotMarkerView[];
  onHoverRegion: (markerKey: string | null) => void;
  onOpenRegion: (hotspot: MapHotspot) => void;
  trendClassName: (trendLabel: string) => string;
  themeLabel: (channel: string) => string;
}

export function HotspotLayer({
  markers,
  onHoverRegion,
  onOpenRegion,
  trendClassName,
  themeLabel,
}: HotspotLayerProps) {
  return (
    <g className="hotspot-layer">
      {markers.map(({ markerKey, hotspot, x, y, color, sizePx, ringRadius, themeSummary, goldsteinText, trendGlowRadius, trendGlowOpacity, selected, hovered }) => (
        <g
          key={markerKey}
          role="button"
          tabIndex={0}
          aria-label={`${hotspot.regionName} 态势热点，GDELT 态势倾向 ${goldsteinText}，${hotspot.trendLabel}，话题 ${themeLabel(hotspot.channel)}。${themeSummary}`}
          className={`hotspot-dot ${selected ? "selected" : ""} ${hovered ? "hovered" : ""} ${trendClassName(hotspot.trendLabel)}`}
          transform={`translate(${x} ${y})`}
          style={{ "--marker-color": color, "--marker-size": `${sizePx}px` } as CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerOver={() => onHoverRegion(markerKey)}
          onPointerEnter={() => onHoverRegion(markerKey)}
          onPointerMove={() => onHoverRegion(markerKey)}
          onPointerLeave={() => onHoverRegion(null)}
          onMouseOver={() => onHoverRegion(markerKey)}
          onMouseEnter={() => onHoverRegion(markerKey)}
          onMouseMove={() => onHoverRegion(markerKey)}
          onMouseLeave={() => onHoverRegion(null)}
          onFocus={() => onHoverRegion(markerKey)}
          onBlur={() => onHoverRegion(null)}
          onClick={() => onOpenRegion(hotspot)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenRegion(hotspot);
            }
          }}
        >
          <title>{hotspot.summary}</title>
          <circle className="hotspot-hit-area" r={Math.max(28, ringRadius + 8)} />
          <circle
            className="hotspot-heat-glow"
            r={trendGlowRadius}
            opacity={trendGlowOpacity}
          />
          <circle className="hotspot-selection-aura" r={ringRadius + 16} />
          <circle className="hotspot-halo" r={ringRadius + 6} />
          <circle className="hotspot-selection-ring" r={ringRadius + 9} />
          <circle className="hotspot-core" r={sizePx / 2} />
        </g>
      ))}
    </g>
  );
}
