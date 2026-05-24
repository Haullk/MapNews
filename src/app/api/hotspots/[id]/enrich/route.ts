import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { canRunHotspotEnrichment, getHotspotDetail } from "@/lib/hotspots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EnrichmentStatus = "running" | "success" | "error";

interface HotspotEnrichmentJob {
  status: EnrichmentStatus;
  startedAt: string;
  finishedAt: string | null;
  message: string;
  output: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __mapnewsHotspotEnrichJobs: Map<number, HotspotEnrichmentJob> | undefined;
}

const jobs = (globalThis.__mapnewsHotspotEnrichJobs ??= new Map<number, HotspotEnrichmentJob>());

function pythonCommand() {
  if (process.env.MAPNEWS_PYTHON) return process.env.MAPNEWS_PYTHON;
  const localPython = path.join(process.cwd(), ".venv", "bin", "python");
  return existsSync(localPython) ? localPython : "python3";
}

function boundedAppend(current: string, chunk: Buffer) {
  return `${current}${chunk.toString("utf8")}`.slice(-8000);
}

function startEnrichmentJob(id: number) {
  const job: HotspotEnrichmentJob = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "正在补充来源元数据、故事组和主题实体。",
    output: "",
  };
  jobs.set(id, job);

  const sourcesPerHotspot = process.env.MAPNEWS_ON_DEMAND_SOURCES_PER_HOTSPOT ?? "12";
  const candidateSourcesPerHotspot = process.env.MAPNEWS_ON_DEMAND_CANDIDATE_SOURCES_PER_HOTSPOT ?? "50";
  const timeoutSeconds = process.env.MAPNEWS_ON_DEMAND_FETCH_TIMEOUT_SECONDS ?? "5";
  const fetchConcurrency = process.env.MAPNEWS_ON_DEMAND_FETCH_CONCURRENCY ?? "5";
  const child = spawn(
    pythonCommand(),
    [
      "-m",
      "worker.p2_enrichment",
      "--hotspot-id",
      String(id),
      "--sources-per-hotspot",
      sourcesPerHotspot,
      "--candidate-sources-per-hotspot",
      candidateSourcesPerHotspot,
      "--timeout",
      timeoutSeconds,
      "--fetch-concurrency",
      fetchConcurrency,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk: Buffer) => {
    job.output = boundedAppend(job.output, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    job.output = boundedAppend(job.output, chunk);
  });
  child.on("error", (error) => {
    job.status = "error";
    job.finishedAt = new Date().toISOString();
    job.message = error.message;
  });
  child.on("close", (code) => {
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      job.status = "success";
      job.message = "来源增强已完成。";
    } else {
      job.status = "error";
      job.message = job.output.trim() || `来源增强失败，退出码 ${code ?? "unknown"}。`;
    }
  });

  return job;
}

function jobPayload(id: number, job: HotspotEnrichmentJob, statusCode = 202) {
  return NextResponse.json(
    {
      hotspotId: id,
      status: job.status,
      message: job.message,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
    { status: statusCode },
  );
}

async function parseHotspotId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseHotspotId(context);
  if (id === null) {
    return NextResponse.json({ error: "Invalid hotspot id" }, { status: 400 });
  }
  const job = jobs.get(id);
  if (!job) {
    return NextResponse.json({ hotspotId: id, status: "idle", message: "暂无来源增强任务。" });
  }
  return jobPayload(id, job, job.status === "running" ? 202 : 200);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseHotspotId(context);
  if (id === null) {
    return NextResponse.json({ error: "Invalid hotspot id" }, { status: 400 });
  }

  const existingJob = jobs.get(id);
  if (existingJob?.status === "running") {
    return jobPayload(id, existingJob);
  }

  const hotspot = await getHotspotDetail(id);
  if (!hotspot) {
    return NextResponse.json({ error: "Hotspot not found" }, { status: 404 });
  }
  if (
    hotspot.explanation.sourceQuality.enhanced &&
    hotspot.storyGroups.length > 0 &&
    hotspot.explanation.sourceQuality.candidateSourceCount > 0
  ) {
    return NextResponse.json({ hotspotId: id, status: "ready", message: "该热点已有增强详情。" });
  }

  const enrichmentReadiness = await canRunHotspotEnrichment(id);
  if (!enrichmentReadiness.ok) {
    return NextResponse.json(
      { hotspotId: id, status: "unavailable", message: enrichmentReadiness.message },
      { status: 409 },
    );
  }

  const job = startEnrichmentJob(id);
  return jobPayload(id, job);
}
