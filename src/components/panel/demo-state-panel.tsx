import type { DataStatus } from "@/lib/hotspots";

interface DemoStatePanelProps {
  status: DataStatus;
  demoMode: boolean;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    running: "运行中",
    success: "成功",
    partial_success: "部分成功",
    failed: "失败",
    pending: "等待中",
    skipped: "已跳过",
  };
  return labels[value] ?? value;
}

function importProgressText(status: DataStatus) {
  const batch = status.latestImportBatch;
  if (!batch) return "暂无导入批次记录。";
  const total = Math.max(batch.filesAttempted, batch.filesRegistered, batch.filesImported, batch.filesFinished);
  const progress = total > 0 ? `${batch.filesImported}/${total} 个文件` : `${batch.filesImported} 个文件`;
  return `${batch.importDate} · ${statusLabel(batch.status)} · 已导入 ${progress}`;
}

export function DemoStatePanel({ status, demoMode }: DemoStatePanelProps) {
  if (!demoMode && status.databaseAvailable && status.currentDataDate) return null;
  const batch = status.latestImportBatch;
  return (
    <div className={`demo-state-panel ${demoMode ? "active" : ""}`}>
      <div>
        <p className="eyebrow">{demoMode ? "演示地图" : "数据状态"}</p>
        <strong>{demoMode ? "当前显示的是演示热点" : status.message}</strong>
        <span>
          {demoMode
            ? "真实 GDELT 数据导入并清洗完成后，地图会自动切换为真实热点。演示点仅用于说明交互方式。"
            : "当前暂无可展示热点，请检查导入和清洗任务。"}
        </span>
      </div>
      <dl className="import-status-grid">
        <div>
          <dt>导入进度</dt>
          <dd>{importProgressText(status)}</dd>
        </div>
        <div>
          <dt>Events / Mentions</dt>
          <dd>
            {batch
              ? `${statusLabel(batch.eventsStatus)} / ${statusLabel(batch.mentionsStatus)}`
              : "暂无记录"}
          </dd>
        </div>
        {batch?.errorMessage ? (
          <div>
            <dt>最近错误</dt>
            <dd>{batch.errorMessage}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
