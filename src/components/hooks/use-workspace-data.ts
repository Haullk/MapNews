import { useCallback, useEffect, useRef, useState } from "react";
import type { DataStatus, HotspotDetail, MapHotspot, QueryStatus } from "@/lib/hotspots";

export type LoadMode = "full" | "hotspots" | "viewport";
type HotspotsPayload = { hotspots: MapHotspot[]; status: { message: string; ok: boolean } };

interface UseWorkspaceDataOptions {
  databaseReady: boolean;
  mapReady: boolean;
  filters: { date: string; channel: string; region: string };
  initialStatus: DataStatus;
  initialHotspots: MapHotspot[];
  initialHotspotStatus: QueryStatus;
  hasInitialWorkspacePayload: boolean;
  viewportKey: string | null;
  queryParams: (withBounds: boolean) => URLSearchParams;
}

export function useWorkspaceData({
  databaseReady,
  mapReady,
  filters,
  initialStatus,
  initialHotspots,
  initialHotspotStatus,
  hasInitialWorkspacePayload,
  viewportKey,
  queryParams,
}: UseWorkspaceDataOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const preserveRankingUntilRef = useRef(0);
  const initialLoadRef = useRef(false);
  const loadWorkspaceRef = useRef<(mode?: LoadMode) => void>(() => undefined);
  const statusCacheRef = useRef<DataStatus | null>(initialStatus);
  const previousFiltersRef = useRef<typeof filters | null>(null);
  const previousViewportRef = useRef<string | null>(null);

  const [hotspots, setHotspots] = useState<MapHotspot[]>(initialHotspots);
  const [ranking, setRanking] = useState<MapHotspot[]>(initialHotspots.slice(0, 20));
  const [status, setStatus] = useState<DataStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(initialHotspotStatus.message);

  const loadWorkspace = useCallback(async (mode: LoadMode = "full") => {
    if (!databaseReady || !mapReady) return;
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const hotspotRequest = fetch(`/api/hotspots?${queryParams(true).toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => ({
        response,
        payload: (await response.json()) as HotspotsPayload,
      }));
      const cachedStatus = statusCacheRef.current;
      const statusRequest =
        mode === "full"
          ? cachedStatus
            ? Promise.resolve<{ status: DataStatus }>({ status: cachedStatus })
            : fetch("/api/data-status", {
                cache: "no-store",
                signal: controller.signal,
              }).then((response) => response.json() as Promise<{ status: DataStatus }>)
          : Promise.resolve<{ status: DataStatus } | null>(null);
      const [hotspotResult, statusPayload] = await Promise.all([
        hotspotRequest,
        statusRequest,
      ]);
      if (requestId !== requestIdRef.current) return;
      if (!hotspotResult.response.ok) {
        throw new Error(hotspotResult.payload.status.message);
      }
      const hotspotPayload = hotspotResult.payload;
      setHotspots(hotspotPayload.hotspots);
      if (mode !== "viewport") {
        setRanking(hotspotPayload.hotspots.slice(0, 20));
      }
      setMessage(hotspotPayload.status.message);

      if (mode === "hotspots" || mode === "viewport") return;

      if (statusPayload) {
        statusCacheRef.current = statusPayload.status;
        setStatus(statusPayload.status);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "热点数据加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [databaseReady, mapReady, queryParams]);

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

  const preserveRankingForViewport = useCallback((milliseconds: number) => {
    preserveRankingUntilRef.current = Date.now() + milliseconds;
  }, []);

  useEffect(() => {
    if (!mapReady || initialLoadRef.current) return;
    initialLoadRef.current = true;
    previousViewportRef.current = viewportKey;
    if (hasInitialWorkspacePayload) return;
    loadWorkspace("full");
  }, [hasInitialWorkspacePayload, loadWorkspace, mapReady, viewportKey]);

  useEffect(() => {
    if (!databaseReady || !mapReady || !initialLoadRef.current) return;
    if (!viewportKey || viewportKey === previousViewportRef.current) return;
    previousViewportRef.current = viewportKey;
    scheduleHotspotLoad();
  }, [databaseReady, mapReady, scheduleHotspotLoad, viewportKey]);

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

  return {
    hotspots,
    ranking,
    status,
    loading,
    message,
    setMessage,
    scheduleHotspotLoad,
    preserveRankingForViewport,
  };
}
