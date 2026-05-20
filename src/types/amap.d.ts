export {};

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    initAmap?: () => void;
    __mapnewsMap?: AMapMap;
  }

  interface AMapNamespace {
    Map: new (el: HTMLElement, options: AMapOptions) => AMapMap;
    Marker: new (options: AMapMarkerOptions) => AMapMarker;
  }

  interface AMapOptions {
    center: [number, number];
    zoom: number;
    viewMode?: "2D" | "3D";
    mapStyle?: string;
  }

  interface AMapMap {
    getBounds(): AMapBounds;
    getZoom(): number;
    setZoom(zoom: number): void;
    setZoomAndCenter(zoom: number, center: [number, number]): void;
    on(eventName: string, handler: () => void): void;
  }

  interface AMapBounds {
    getNorthEast(): AMapLngLat;
    getSouthWest(): AMapLngLat;
  }

  interface AMapLngLat {
    getLat(): number;
    getLng(): number;
  }

  interface AMapMarkerOptions {
    map: AMapMap;
    position: [number, number];
    title?: string;
    content?: string;
  }

  interface AMapMarker {
    on(eventName: string, handler: () => void): void;
    setMap(map: AMapMap | null): void;
  }
}
