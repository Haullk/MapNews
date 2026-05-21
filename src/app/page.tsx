import { NewsMap } from "@/components/news-map";
import { getInitialWorkspaceData } from "@/lib/hotspots";

export default async function Home() {
  const workspace = await getInitialWorkspaceData();

  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="地图筛选">
        <div className="brand-block">
          <p className="eyebrow">全球热点</p>
          <h1>MapNews 地图新闻</h1>
        </div>

        <div className="status-strip">
          <span className={workspace.databaseReady ? "status-dot ready" : "status-dot"} />
          <span>{workspace.status.message}</span>
        </div>
      </section>

      <NewsMap
        dates={workspace.dates}
        channels={workspace.channels}
        databaseReady={workspace.databaseReady}
        initialStatus={workspace.status}
      />
    </main>
  );
}
