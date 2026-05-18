import { NewsMap } from "@/components/news-map";
import { getInitialFilters } from "@/lib/events";

export default async function Home() {
  const filters = await getInitialFilters();
  const mapKey = process.env.NEXT_PUBLIC_AMAP_KEY ?? "";
  const mapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE ?? "";

  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="地图筛选">
        <div className="brand-block">
          <p className="eyebrow">GDELT Events</p>
          <h1>MapNews 地图新闻</h1>
        </div>

        <div className="status-strip">
          <span className={filters.databaseReady ? "status-dot ready" : "status-dot"} />
          <span>{filters.databaseReady ? "数据库已连接" : "等待数据库配置或数据导入"}</span>
        </div>
      </section>

      <NewsMap
        mapKey={mapKey}
        mapSecurityCode={mapSecurityCode}
        dates={filters.dates}
        eventCodes={filters.eventCodes}
        countries={filters.countries}
        databaseReady={filters.databaseReady}
      />
    </main>
  );
}
