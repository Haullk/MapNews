import { NewsMap } from "@/components/news-map";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { getInitialWorkspaceData } from "@/lib/hotspots";

export default async function Home() {
  const workspace = await getInitialWorkspaceData();

  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="地图筛选">
        <div className="brand-block">
          <p className="eyebrow">全球态势热点</p>
          <h1>MapNews 全球态势地图</h1>
        </div>

        <div className="status-strip">
          <span className={workspace.databaseReady ? "status-dot ready" : "status-dot"} />
          <span>{workspace.status.message}</span>
        </div>
      </section>

      <ErrorBoundary>
        <NewsMap
          dates={workspace.dates}
          channels={workspace.channels}
          databaseReady={workspace.databaseReady}
          initialStatus={workspace.status}
          initialHotspots={workspace.initialHotspots}
          initialHotspotStatus={workspace.initialHotspotStatus}
          initialBrief={workspace.initialBrief}
        />
      </ErrorBoundary>
    </main>
  );
}
