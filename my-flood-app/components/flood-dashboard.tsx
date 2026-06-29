"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Database,
  Drone,
  ExternalLink,
  ImageIcon,
  MapPin,
  Navigation,
  PlaneTakeoff,
  Radar,
  Radio,
  Route,
  Settings,
  ShieldCheck,
  Signal,
  Truck,
  Users,
  Waves,
} from "lucide-react";

import { GooeyLoader } from "@/components/ui/loader-10";

export type DashboardView = "overview" | "reports" | "drones" | "settings";

type ReportPriority = "critical" | "warning" | "normal";
type ReportStatus = "submitted" | "reviewing" | "assigned" | "resolved";

type FloodReport = {
  id: string;
  userId: string | null;
  reporterName: string;
  imagePath: string;
  imageUrl: string | null;
  lat: number;
  lng: number;
  details: string;
  depthCm: number | null;
  risk: string;
  confidence: number | null;
  labels: string[];
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: string;
};

type ReportsResponse = {
  ok: boolean;
  configured?: boolean;
  reports?: FloodReport[];
  message?: string;
};

type DashboardStats = {
  userCount: number | null;
  reportCount: number;
  droneCount: number;
  missionCount: number;
  waterEventCount: number;
};

type DashboardStatsResponse = {
  ok: boolean;
  stats?: DashboardStats;
};

type DroneRecord = {
  id: string;
  code: string;
  name: string;
  status: string;
  current_lat: number | null;
  current_lng: number | null;
  battery_percent: number | null;
  signal_percent: number | null;
  last_seen_at: string | null;
  updated_at: string;
};

type DroneMissionRecord = {
  id: string;
  drone_id: string | null;
  mission_type: string;
  status: string;
  target_lat: number | null;
  target_lng: number | null;
  created_at: string;
};

type DroneCaptureRecord = {
  id: string;
  drone_id: string | null;
  lat: number;
  lng: number;
  yolo_depth_cm: number | null;
  yolo_risk: string | null;
  yolo_confidence: number | null;
  created_at: string;
};

type DroneWaterEvent = {
  id: string;
  drone_id: string | null;
  device_code: string;
  source_type: string;
  method: string | null;
  yolo_depth_cm: number | null;
  yolo_risk: string;
  raw_severity: string | null;
  confidence: number | null;
  level_percent: number | null;
  lat: number | null;
  lng: number | null;
  detections: unknown[] | null;
  created_at: string;
};

type DroneOperationsResponse = {
  ok: boolean;
  configured?: boolean;
  drones?: DroneRecord[];
  missions?: DroneMissionRecord[];
  captures?: DroneCaptureRecord[];
  waterEvents?: DroneWaterEvent[];
  message?: string;
};

type FloodDashboardProps = {
  activeView?: DashboardView;
};

const markerPositions = [
  "left-[38%] top-[52%]",
  "left-[70%] top-[64%]",
  "left-[54%] top-[42%]",
  "left-[18%] top-[30%]",
  "left-[62%] top-[26%]",
  "left-[28%] top-[70%]",
];

const priorityClasses: Record<ReportPriority, string> = {
  critical: "border-rose-200 bg-rose-100 text-rose-700",
  warning: "border-amber-200 bg-amber-100 text-amber-700",
  normal: "border-blue-200 bg-blue-100 text-blue-700",
};

const priorityLabels: Record<ReportPriority, string> = {
  critical: "Critical",
  warning: "Watch",
  normal: "Normal",
};

const statusLabels: Record<ReportStatus, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  assigned: "Assigned",
  resolved: "Resolved",
};

const statusClasses: Record<ReportStatus, string> = {
  submitted: "bg-emerald-100 text-emerald-700",
  reviewing: "bg-blue-100 text-blue-700",
  assigned: "bg-slate-100 text-slate-700",
  resolved: "bg-zinc-100 text-zinc-600",
};

const waterRiskClasses: Record<string, string> = {
  danger: "border-rose-200 bg-rose-100 text-rose-700",
  watch: "border-amber-200 bg-amber-100 text-amber-700",
  safe: "border-emerald-200 bg-emerald-100 text-emerald-700",
  pending: "border-slate-200 bg-slate-100 text-slate-700",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function waterDepthNumber(report: Pick<FloodReport, "depthCm">) {
  const value = Number(report.depthCm);
  return Number.isFinite(value) ? value : null;
}

function waterLevelPercent(report: Pick<FloodReport, "depthCm">) {
  const depth = waterDepthNumber(report);
  return depth === null ? 0 : Math.max(4, Math.min(100, (depth / 80) * 100));
}

function waterDepthText(report: Pick<FloodReport, "depthCm">) {
  const depth = waterDepthNumber(report);
  return depth === null ? "pending" : depth.toFixed(1) + " cm";
}

function riskText(report: FloodReport) {
  return waterDepthNumber(report) === null ? "YOLO pending" : "YOLO " + waterDepthText(report);
}

function reportMapsHref(report: FloodReport | undefined) {
  if (!report) {
    return "https://www.google.com/maps";
  }

  return `https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`;
}

function confidenceText(value: number | null) {
  if (value === null) {
    return "confidence pending";
  }

  return `${Math.round(value * 100)}% confidence`;
}

function aiReview(report: FloodReport) {
  const labels = report.labels.join(" ").toLowerCase();
  const floodEvidence =
    report.risk === "danger" ||
    report.risk === "watch" ||
    (report.depthCm !== null && report.depthCm > 5) ||
    /(flood|water|waterline|inundation|road_flood)/i.test(labels);
  const lowEvidence =
    report.risk === "safe" &&
    (report.depthCm === 0 || /(dry|no[_ -]?flood|not[_ -]?flood|normal|safe)/i.test(labels) || report.labels.length > 0);

  if (floodEvidence) {
    return {
      state: "detected" as const,
      title: "Flood image detected",
      detail: "AI found water evidence in the user photo.",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      iconClassName: "bg-rose-100 text-rose-700",
    };
  }

  if (lowEvidence) {
    return {
      state: "low_evidence" as const,
      title: "Low flood evidence",
      detail: "AI marked this user photo as safe or not flooded.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconClassName: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    state: "review" as const,
    title: "Needs human review",
    detail: "YOLO is pending or not confident enough yet.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    iconClassName: "bg-amber-100 text-amber-700",
  };
}

function WaterLevelMeter({ report }: { report: FloodReport }) {
  const depth = waterDepthNumber(report);
  const percent = waterLevelPercent(report);
  const fillClass = report.risk === "danger" ? "bg-rose-500" : report.risk === "watch" ? "bg-amber-500" : report.risk === "safe" ? "bg-emerald-500" : "bg-blue-500";
  const labelClass = report.risk === "danger" ? "text-rose-700" : report.risk === "watch" ? "text-amber-700" : report.risk === "safe" ? "text-emerald-700" : "text-slate-700";

  return (
    <div className="rounded-lg border border-slate-100 bg-white/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-slate-500">Water level</span>
        <span className={labelClass}>{depth === null ? "pending" : waterDepthText(report)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <span className={["block h-full rounded-full", fillClass].join(" ")} style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <Icon className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-3 font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function FloodDashboard({ activeView = "overview" }: FloodDashboardProps) {
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/reports", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as ReportsResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to load reports.");
        }

        setReports(payload.reports || []);
        setConfigured(Boolean(payload.configured));

        const statsResponse = await fetch("/api/dashboard/stats", { cache: "no-store", signal: controller.signal });
        const statsPayload = (await statsResponse.json()) as DashboardStatsResponse;
        if (statsResponse.ok && statsPayload.ok) setStats(statsPayload.stats || null);
        setLastUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setReports([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load reports.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadReports();
    const refreshTimer = window.setInterval(loadReports, 10000);

    return () => {
      window.clearInterval(refreshTimer);
      controller.abort();
    };
  }, []);

  const summary = useMemo(() => {
    const critical = reports.filter((report) => report.priority === "critical").length;
    const withImages = reports.filter((report) => report.imagePath).length;
    const assigned = reports.filter((report) => report.status === "assigned").length;

    return [
      { label: "Real users", value: stats?.userCount ?? 0, unit: "users", icon: Users, className: "bg-cyan-50 text-cyan-700" },
      { label: "User reports", value: reports.length, unit: "items", icon: Users, className: "bg-blue-50 text-blue-700" },
      { label: "Stored images", value: withImages, unit: "files", icon: ImageIcon, className: "bg-emerald-50 text-emerald-700" },
      { label: "YOLO danger", value: critical, unit: "points", icon: AlertTriangle, className: "bg-rose-50 text-rose-700" },
      { label: "Assigned cases", value: assigned, unit: "cases", icon: Truck, className: "bg-amber-50 text-amber-700" },
    ];
  }, [reports, stats]);

  const activeQueue = reports.filter((report) => report.priority !== "normal").slice(0, 5);
  const latestReport = reports[0];

  return (
    <main id="dashboard" className="min-h-screen bg-[#f4f7f6] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        {activeView === "overview" ? (
          <OverviewView
            activeQueue={activeQueue}
            configured={configured}
            error={error}
            latestReport={latestReport}
            loading={loading}
            lastUpdatedAt={lastUpdatedAt}
            reports={reports}
            summary={summary}
          />
        ) : null}

        {activeView === "reports" ? (
          <ReportsView error={error} loading={loading} reports={reports} />
        ) : null}

        {activeView === "drones" ? <DronesView /> : null}


        {activeView === "settings" ? <SettingsView configured={configured} /> : null}
      </div>
    </main>
  );
}

function OverviewView({
  activeQueue,
  configured,
  error,
  latestReport,
  loading,
  lastUpdatedAt,
  reports,
  summary,
}: {
  activeQueue: FloodReport[];
  configured: boolean | null;
  error: string | null;
  latestReport: FloodReport | undefined;
  loading: boolean;
  lastUpdatedAt: string | null;
  reports: FloodReport[];
  summary: Array<{ label: string; value: number; unit: string; icon: typeof Users; className: string }>;
}) {
  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <Radio className="h-3.5 w-3.5" />
              Operator dashboard
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Flood response command center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
              Live database view for citizen reports, YOLO water-level analysis, rescue queue and drone operations.
            </p>
          </div>
          <div
            className={`flex w-fit items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
              configured ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"
            }`}
          >
            {configured ? <ShieldCheck className="h-4 w-4" /> : <Database className="h-4 w-4" />}
            {configured ? "Supabase connected" : "Supabase env required"}
            {lastUpdatedAt ? <span className="text-xs font-normal opacity-75">Synced {formatDate(lastUpdatedAt)}</span> : null}
          </div>
        </div>
      </section>

      <SummaryGrid summary={summary} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <MapPanel latestReport={latestReport} loading={loading} reports={reports} />
          <ReportsPanel error={error} loading={loading} reports={reports} />
        </div>
        <aside className="flex flex-col gap-4">
          <AiCard reports={reports} />
          <OperationalOverviewCard reports={reports} />
          <RescueQueue reports={activeQueue} />
        </aside>
      </section>
    </>
  );
}

function SummaryGrid({ summary }: { summary: Array<{ label: string; value: number; unit: string; icon: typeof Users; className: string }> }) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {summary.map((item) => {
        const Icon = item.icon;

        return (
          <article key={item.label} className="min-h-[116px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                  {item.value} <span className="text-sm font-normal text-slate-400">{item.unit}</span>
                </p>
              </div>
              <span className={`rounded-lg p-2 ${item.className}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MapPanel({ latestReport, loading, reports }: { latestReport: FloodReport | undefined; loading: boolean; reports: FloodReport[] }) {
  const mapsHref = reportMapsHref(latestReport);

  return (
    <div className="flex min-h-[460px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Live response map</h2>
          <p className="mt-1 text-sm text-slate-500">Map markers come from the database. No sample cases are rendered.</p>
        </div>
        <a
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#3182ce] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2b6cb0]"
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-4 w-4" />
          Open map
        </a>
      </div>

      <div className="relative flex-1 overflow-hidden bg-[linear-gradient(90deg,#dbeafe_1px,transparent_1px),linear-gradient(#dbeafe_1px,transparent_1px)] bg-[size:48px_48px]">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-emerald-50" />
        <div className="absolute left-[7%] top-[23%] h-32 w-[76%] rotate-[-8deg] rounded-full border-2 border-blue-200/90" />
        <div className="absolute bottom-[14%] right-[8%] h-36 w-[54%] rotate-[12deg] rounded-full border-2 border-emerald-200/90" />
        <div className="absolute left-[28%] top-[62%] h-28 w-[46%] rotate-[18deg] rounded-full border-2 border-slate-200/80" />

        {reports.map((report, index) => (
          <div key={report.id} className={`absolute ${markerPositions[index % markerPositions.length]} -translate-x-1/2 -translate-y-1/2`}>
            <div className="flex flex-col items-center gap-2">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-4 border-white text-white shadow-lg ${
                  report.priority === "critical" ? "bg-rose-600" : report.priority === "warning" ? "bg-amber-500" : "bg-blue-600"
                }`}
              >
                <MapPin className="h-5 w-5" />
              </span>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs shadow-sm">
                <p className="font-semibold text-slate-800">{report.reporterName}</p>
                <p className="text-slate-500">{riskText(report)}</p>
              </div>
            </div>
          </div>
        ))}

        {!loading && reports.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-lg border border-slate-200 bg-white/95 p-5 text-center shadow-sm backdrop-blur">
              <Database className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-bold text-slate-900">No active cases</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                The dashboard is clean. New citizen reports and drone captures will appear here after they reach the database.
              </p>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-sm">
              <GooeyLoader primaryColor="#f87171" secondaryColor="#fca5a5" borderColor="#dbeafe" />
              <p className="mt-4 text-center text-sm font-semibold text-slate-700">Loading database reports</p>
            </div>
          </div>
        ) : null}

        {latestReport ? (
          <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-emerald-100 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-slate-900">Latest report submitted</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {latestReport.id} - {latestReport.reporterName} - {riskText(latestReport)}
                  </p>
                </div>
              </div>
              <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Marker added</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AiCard({ reports = [] }: { reports?: FloodReport[] }) {
  const latestReport = reports[0];
  const review = latestReport ? aiReview(latestReport) : null;
  const detectedCount = reports.filter((report) => aiReview(report).state === "detected").length;
  const pendingCount = reports.filter((report) => aiReview(report).state === "review").length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">YOLO station analysis</h2>
          <p className="mt-1 text-sm text-slate-500">Water-level checks stay inside each user report and response queue.</p>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">AI</span>
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <GooeyLoader className="mx-auto" primaryColor="#f87171" secondaryColor="#fca5a5" borderColor="#dbeafe" />
        <p className="mt-4 text-center text-sm font-semibold text-slate-700">Ready for YOLO API results</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <span className="rounded-lg bg-white px-3 py-2 font-semibold text-rose-700">Detected {detectedCount}</span>
          <span className="rounded-lg bg-white px-3 py-2 font-semibold text-amber-700">Review {pendingCount}</span>
        </div>
      </div>

      {latestReport && review ? (
        <article className={`mt-4 overflow-hidden rounded-lg border ${review.className}`}>
          {latestReport.imageUrl ? (
            <img src={latestReport.imageUrl} alt="Latest user flood report" className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center bg-white/70">
              <ImageIcon className="h-10 w-10 opacity-60" />
            </div>
          )}
          <div className="p-4">
            <div className="flex items-start gap-3">
              <span className={`rounded-lg p-2 ${review.iconClassName}`}>
                {review.state === "detected" ? <AlertTriangle className="h-4 w-4" /> : review.state === "low_evidence" ? <ShieldCheck className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </span>
              <div>
                <p className="font-bold">{review.title}</p>
                <p className="mt-1 text-sm opacity-80">{review.detail}</p>
                <div className="mt-3">
                  <WaterLevelMeter report={latestReport} />
                </div>
                <p className="mt-2 text-xs opacity-75">{riskText(latestReport)} - {confidenceText(latestReport.confidence)}</p>
              </div>
            </div>
          </div>
        </article>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No user photos have reached YOLO analysis yet.</div>
      )}
    </section>
  );
}

function OperationalOverviewCard({ reports }: { reports: FloodReport[] }) {
  const detected = reports.filter((report) => aiReview(report).state === "detected").length;
  const critical = reports.filter((report) => report.priority === "critical").length;
  const pending = reports.filter((report) => aiReview(report).state === "review").length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Operational overview</h2>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Active reports</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{reports.length}</p>
        </div>
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-600">Critical</p>
          <p className="mt-1 text-2xl font-bold text-rose-700">{critical}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-600">YOLO alerts</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{detected}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-600">Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{pending}</p>
        </div>
      </div>
    </section>
  );
}
function RescueQueue({ reports }: { reports: FloodReport[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Priority response queue</h2>
      <div className="mt-4 space-y-3">
        {reports.length > 0 ? (
          reports.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-100 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{item.reporterName}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Navigation className="h-3 w-3" />
                    {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold ${priorityClasses[item.priority]}`}>
                  {priorityLabels[item.priority]}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Truck className="h-3.5 w-3.5" />
                  Waiting for team
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(item.createdAt)}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No priority cases</div>
        )}
      </div>
    </section>
  );
}

function ReportsPanel({ error, loading, reports }: { error: string | null; loading: boolean; reports: FloodReport[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Incoming reports</h2>
          <p className="mt-1 text-sm text-slate-500">Supabase data: image, location, user and YOLO result</p>
        </div>
        <button className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <Route className="h-4 w-4" />
          Plan response route
        </button>
      </div>

      {error ? <div className="m-4 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      {reports.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {reports.map((report) => (
            <article key={report.id} className="grid gap-4 p-4 md:grid-cols-[96px_120px_minmax(0,1fr)_170px_150px] md:items-center">
              <div className="h-16 w-24 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {report.imageUrl ? <img src={report.imageUrl} alt="User flood report" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon className="h-5 w-5" /></div>}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Report ID</p>
                <p className="font-bold text-slate-900">{report.id.slice(0, 8)}</p>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{report.reporterName}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClasses[report.status]}`}>{statusLabels[report.status]}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{report.details || "No additional details"}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Waves className="h-4 w-4 text-blue-600" />
                {riskText(report)}
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className={`rounded-full border px-2 py-1 text-xs font-bold ${priorityClasses[report.priority]}`}>{priorityLabels[report.priority]}</span>
                <span className="text-xs text-slate-400">{formatDate(report.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : !loading ? (
        <div className="p-8">
          <EmptyState icon={Database} title="No dashboard records" description="Ready to receive citizen reports through /api/reports." />
        </div>
      ) : null}
    </section>
  );
}

function ReportsView({ error, loading, reports }: { error: string | null; loading: boolean; reports: FloodReport[] }) {
  return <ReportsPanel error={error} loading={loading} reports={reports} />;
}

function DronesView() {
  const [drones, setDrones] = useState<DroneRecord[]>([]);
  const [missions, setMissions] = useState<DroneMissionRecord[]>([]);
  const [captures, setCaptures] = useState<DroneCaptureRecord[]>([]);
  const [waterEvents, setWaterEvents] = useState<DroneWaterEvent[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDroneOperations() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/drones", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as DroneOperationsResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to load drone operations.");
        }

        setDrones(payload.drones || []);
        setMissions(payload.missions || []);
        setCaptures(payload.captures || []);
        setWaterEvents(payload.waterEvents || []);
        setConfigured(Boolean(payload.configured));

        const statsResponse = await fetch("/api/dashboard/stats", { cache: "no-store", signal: controller.signal });
        const statsPayload = (await statsResponse.json()) as DashboardStatsResponse;
        if (statsResponse.ok && statsPayload.ok) setStats(statsPayload.stats || null);
        setLastUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setDrones([]);
        setMissions([]);
        setCaptures([]);
        setWaterEvents([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load drone operations.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDroneOperations();

    return () => controller.abort();
  }, []);

  const connectedDrones = drones.filter((drone) => drone.status !== "offline").length;
  const activeMissions = missions.filter((mission) => mission.status === "active").length;
  const positionedDrones = drones.filter((drone) => drone.current_lat !== null && drone.current_lng !== null);
  const latestWaterEvent = waterEvents[0];
  const latestCapture = captures[0];
  const droneStats = [
    { label: "Connected drones", value: connectedDrones, unit: "units", icon: Drone, className: "bg-blue-50 text-blue-700" },
    { label: "Active missions", value: activeMissions, unit: "missions", icon: PlaneTakeoff, className: "bg-emerald-50 text-emerald-700" },
    { label: "YOLO water events", value: waterEvents.length, unit: "events", icon: Waves, className: "bg-amber-50 text-amber-700" },
    { label: "Drone captures", value: captures.length, unit: "images", icon: ImageIcon, className: "bg-rose-50 text-rose-700" },
  ];

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              <Drone className="h-3.5 w-3.5" />
              Drone operations
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Drone mission control</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
              Rebuilt around the previous drone prototype: Pi telemetry, YOLO water-level events, capture upload and mission data now land in one dashboard.
            </p>
          </div>
          <div
            className={`flex w-fit items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
              configured ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"
            }`}
          >
            {configured ? <ShieldCheck className="h-4 w-4" /> : <Database className="h-4 w-4" />}
            {configured ? "Drone database connected" : "Drone schema pending"}
          </div>
        </div>
      </section>

      <SummaryGrid summary={droneStats} />

      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Legacy drone2 control room</h2>
            <p className="mt-1 text-sm text-slate-300">Embedded from the previous drone web app and kept connected with the new flood dashboard.</p>
          </div>
          <a className="inline-flex w-fit items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100" href="https://autokgapai-drone.pages.dev/" target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open full screen
          </a>
        </div>
        <iframe title="Legacy drone2 control room" src="https://autokgapai-drone.pages.dev/" className="h-[720px] w-full border-0 bg-slate-950" />
      </section>

      {error ? <div className="rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Drone map layer</h2>
              <p className="mt-1 text-sm text-slate-500">Live position markers appear after the Pi or gateway sends coordinates.</p>
            </div>
            {latestWaterEvent ? (
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${waterRiskClasses[latestWaterEvent.yolo_risk] || waterRiskClasses.pending}`}>
                Latest {latestWaterEvent.yolo_depth_cm ?? "--"} cm
              </span>
            ) : null}
          </div>
          <div className="relative min-h-[500px] overflow-hidden bg-[linear-gradient(90deg,#dbeafe_1px,transparent_1px),linear-gradient(#dbeafe_1px,transparent_1px)] bg-[size:48px_48px]">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50" />
            <div className="absolute left-[18%] top-[22%] h-32 w-[62%] rotate-[-12deg] rounded-full border-2 border-slate-200" />
            <div className="absolute bottom-[18%] right-[10%] h-36 w-[46%] rotate-[18deg] rounded-full border-2 border-blue-200" />

            {positionedDrones.map((drone, index) => (
              <div key={drone.id} className={`absolute ${markerPositions[index % markerPositions.length]} -translate-x-1/2 -translate-y-1/2`}>
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-blue-700 text-white shadow-lg">
                    <Drone className="h-5 w-5" />
                  </span>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs shadow-sm">
                    <p className="font-semibold text-slate-800">{drone.code}</p>
                    <p className="text-slate-500">{drone.current_lat?.toFixed(5)}, {drone.current_lng?.toFixed(5)}</p>
                  </div>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-sm">
                  <GooeyLoader primaryColor="#38bdf8" secondaryColor="#60a5fa" borderColor="#dbeafe" />
                  <p className="mt-4 text-center text-sm font-semibold text-slate-700">Loading drone operations</p>
                </div>
              </div>
            ) : null}

            {!loading && positionedDrones.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-sm rounded-lg border border-dashed border-slate-200 bg-white/95 p-6 text-center shadow-sm backdrop-blur">
                  <Radar className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-bold text-slate-900">No drone telemetry yet</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    The dashboard is ready for the old Pi bridge and the new Supabase-backed drone APIs.
                  </p>
                </div>
              </div>
            ) : null}

            {latestWaterEvent ? (
              <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-blue-100 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
                      <Waves className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">Latest YOLO water event</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {latestWaterEvent.device_code} - {latestWaterEvent.yolo_depth_cm ?? "pending"} cm - {formatDate(latestWaterEvent.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${waterRiskClasses[latestWaterEvent.yolo_risk] || waterRiskClasses.pending}`}>
                    {latestWaterEvent.yolo_risk}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Fleet status</h2>
            <div className="mt-4 space-y-3">
              {drones.length > 0 ? (
                drones.slice(0, 6).map((drone) => (
                  <article key={drone.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{drone.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{drone.code} - {drone.last_seen_at ? formatDate(drone.last_seen_at) : "No heartbeat"}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${drone.status === "offline" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                        {drone.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span className="rounded-lg bg-slate-50 px-3 py-2">Battery <b>{drone.battery_percent ?? "--"}%</b></span>
                      <span className="rounded-lg bg-slate-50 px-3 py-2">Signal <b>{drone.signal_percent ?? "--"}%</b></span>
                    </div>
                  </article>
                ))
              ) : !loading ? (
                <EmptyState icon={Drone} title="No drones connected" description="A drone will appear here after the gateway posts telemetry or a YOLO water event." />
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">YOLO water events</h2>
            <div className="mt-4 space-y-3">
              {waterEvents.length > 0 ? (
                waterEvents.slice(0, 5).map((event) => (
                  <article key={event.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{event.device_code}</p>
                        <p className="mt-1 text-xs text-slate-500">{event.method || "water-level detector"}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-bold ${waterRiskClasses[event.yolo_risk] || waterRiskClasses.pending}`}>
                        {event.yolo_risk}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span>{event.yolo_depth_cm === null ? "pending" : `${event.yolo_depth_cm} cm`}</span>
                      <span>{formatDate(event.created_at)}</span>
                    </div>
                  </article>
                ))
              ) : !loading ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No YOLO water events</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Bridge endpoints</h2>
            <div className="mt-4 space-y-3">
              {[
                { icon: Waves, title: "Water YOLO", body: "POST /api/yolo/water-level" },
                { icon: Signal, title: "Telemetry", body: "POST /api/drones/telemetry" },
                { icon: ImageIcon, title: "Captures", body: "POST /api/drones/captures" },
                { icon: BatteryCharging, title: "Safety", body: latestCapture ? `Latest capture ${formatDate(latestCapture.created_at)}` : "Low battery and weak signal stay visible in fleet status." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">{item.title}</p>
                        <p className="mt-1 break-words text-sm leading-6 text-slate-500">{item.body}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

function SettingsView({ configured }: { configured: boolean | null }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
          <Settings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">System settings</h1>
          <p className="mt-1 text-sm text-slate-500">Environment and deployment checks for database, YOLO and drone integrations.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-100 p-4">
          <p className="text-sm font-bold text-slate-900">Database</p>
          <p className="mt-2 text-sm text-slate-500">{configured ? "Supabase server env is available." : "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."}</p>
        </div>
        <div className="rounded-lg border border-slate-100 p-4">
          <p className="text-sm font-bold text-slate-900">Drone schema</p>
          <p className="mt-2 text-sm text-slate-500">Run supabase/schema.sql to create drone fleet, mission, telemetry and capture tables.</p>
        </div>
      </div>
    </section>
  );
}
