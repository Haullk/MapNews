import type { DailyBrief } from "@/lib/hotspots";

interface DailyBriefCardProps {
  brief: DailyBrief | null;
  loading: boolean;
  message: string | null;
  themeLabel: (channel: string) => string;
  variant?: "sidebar" | "toolbar";
}

function formatDelta(value: number | null) {
  if (value === null) return "暂无昨日对比";
  if (value === 0) return "较昨日持平";
  return `较昨日${value > 0 ? "增加" : "减少"} ${Math.abs(value).toLocaleString("zh-CN")} 个`;
}

export function DailyBriefCard({ brief, loading, message, themeLabel, variant = "sidebar" }: DailyBriefCardProps) {
  const className = variant === "toolbar" ? "daily-brief-card toolbar-brief-card" : "sidebar-section daily-brief-card";

  if (loading && !brief) {
    if (variant === "toolbar") {
      return (
        <div className={className} aria-label="今日简报加载中">
          <span className="brief-band-label">
            <i />
            今日简报
          </span>
          <span className="brief-band-skeleton" />
          <span className="brief-band-skeleton" />
        </div>
      );
    }
    return (
      <div className={className}>
        <div className="section-heading">
          <p className="eyebrow">今日简报</p>
          <span>加载中</span>
        </div>
        <div className="brief-skeleton" aria-label="今日简报加载中">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  const topTopics = brief?.topChannels.slice(0, 3).map((item) => themeLabel(item.name)) ?? [];
  const hotspotCount = (brief?.hotspotCount ?? 0).toLocaleString("zh-CN");

  if (variant === "toolbar") {
    return (
      <div className={className}>
        <span className="brief-band-label">
          <i />
          今日简报
        </span>
        <span className="brief-band-item">
          <strong>{hotspotCount}</strong>
          个热点
        </span>
        <span className="brief-band-item muted">{formatDelta(brief?.hotspotDelta ?? null)}</span>
        <span className="brief-band-topics">
          {topTopics.length ? `主要话题：${topTopics.join(" · ")}` : message ?? "暂无主要话题"}
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="section-heading">
        <p className="eyebrow">今日简报</p>
        <span>{brief?.dataDate ?? "暂无日期"}</span>
      </div>
      <div className="brief-metrics">
        <strong>{hotspotCount}</strong>
        <span>个热点</span>
        <em>{formatDelta(brief?.hotspotDelta ?? null)}</em>
      </div>
      <p>{topTopics.length ? `主要话题：${topTopics.join("、")}` : "暂无主要话题。"}</p>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
