import { NewsMap } from "@/components/news-map";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { getInitialWorkspaceData } from "@/lib/hotspots";

export default async function Home() {
  const workspace = await getInitialWorkspaceData();

  return (
    <main className="app-shell">
      <ErrorBoundary>
        <NewsMap
          dates={workspace.dates}
          channels={workspace.channels}
          databaseReady={workspace.databaseReady}
          initialStatus={workspace.status}
          initialHotspots={workspace.initialHotspots}
          initialHotspotStatus={workspace.initialHotspotStatus}
        />
      </ErrorBoundary>
    </main>
  );
}
