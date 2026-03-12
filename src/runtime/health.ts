import fs from 'fs';
import path from 'path';
import type { BrainStore } from '../db/client.ts';
import type { MemoryQualityMetrics } from '../types.ts';

export const HEALTH_WORKER_KEYS = [
  'claude',
  'codex',
  'shell',
  'browser',
  'mail',
  'verifier',
] as const;

export type HealthWorkerKey = (typeof HEALTH_WORKER_KEYS)[number];

export const HEALTH_ALERT_KINDS = [
  'worker_unavailable',
  'memory_staleness',
  'mission_failure_rate',
  'disk_usage',
] as const;

export type HealthAlertKind = (typeof HEALTH_ALERT_KINDS)[number];

export const HEALTH_ALERT_SEVERITIES = ['warning', 'critical'] as const;
export type HealthAlertSeverity = (typeof HEALTH_ALERT_SEVERITIES)[number];

export interface WorkerAvailabilityRecord {
  worker: HealthWorkerKey;
  available: boolean;
  detail: string;
  checked_at: number;
}

export interface SystemHealthAlert {
  id: string;
  kind: HealthAlertKind;
  severity: HealthAlertSeverity;
  message: string;
  source_key: string;
  created_at: number;
}

export interface SystemHealthSnapshot {
  generated_at: number;
  worker_availability: WorkerAvailabilityRecord[];
  memory: {
    stale_ratio: number;
    stale_candidate_count: number;
    active_memory_count: number;
  };
  missions: {
    window_hours: number;
    total_runs: number;
    verified_complete: number;
    verification_failed: number;
    rejected: number;
    failure_rate: number;
  };
  disk: {
    data_dir: string;
    bytes_used: number;
    threshold_bytes: number;
    usage_ratio: number;
  };
  alerts: SystemHealthAlert[];
}

export interface RuntimeHealthMonitorOptions {
  store: BrainStore;
  dataDir: string;
  memoryQualityProvider: () => MemoryQualityMetrics;
  workerProbes?: Partial<Record<HealthWorkerKey, WorkerProbe>>;
  now?: () => number;
  missionWindowHours?: number;
  failureRateWarnThreshold?: number;
  memoryStaleRatioWarnThreshold?: number;
  diskUsageWarnThresholdBytes?: number;
  onAlert?: (alerts: SystemHealthAlert[], snapshot: SystemHealthSnapshot) => void | Promise<void>;
}

function createAlertId(kind: HealthAlertKind, sourceKey: string, createdAt: number): string {
  const normalizedKey = sourceKey.replace(/[^a-zA-Z0-9_\-:.]/g, '_');
  return `alert_${kind}_${normalizedKey}_${createdAt}`;
}

function commandExists(command: string): boolean {
  try {
    return Bun.which(command) != null;
  } catch {
    return false;
  }
}

function folderSizeBytes(rootPath: string): number {
  if (!fs.existsSync(rootPath)) {
    return 0;
  }
  let total = 0;
  const stack = [rootPath];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) {
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(next);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(next);
      } catch {
        entries = [];
      }
      for (const entry of entries) {
        stack.push(path.join(next, entry));
      }
    } else {
      total += stat.size;
    }
  }
  return total;
}

const DEFAULT_WORKER_PROBES: Record<HealthWorkerKey, () => { available: boolean; detail: string }> = {
  claude: () => ({
    available: commandExists('claude'),
    detail: commandExists('claude') ? 'claude CLI detected' : 'claude CLI was not found in PATH',
  }),
  codex: () => ({
    available: commandExists('codex'),
    detail: commandExists('codex') ? 'codex CLI detected' : 'codex CLI was not found in PATH',
  }),
  shell: () => ({
    available: commandExists('bun'),
    detail: commandExists('bun') ? 'bun CLI detected for shell/runtime tasks' : 'bun CLI was not found in PATH',
  }),
  browser: () => ({
    available: true,
    detail: 'browser worker adapter is manager-owned and available by default',
  }),
  mail: () => ({
    available: true,
    detail: 'mail worker adapter is manager-owned and available in draft mode',
  }),
  verifier: () => ({
    available: true,
    detail: 'verifier is manager-owned and always available',
  }),
};

type WorkerProbe = () => Promise<{ available: boolean; detail: string }> | { available: boolean; detail: string };

export class RuntimeHealthMonitor {
  private readonly store: BrainStore;
  private readonly dataDir: string;
  private readonly memoryQualityProvider: () => MemoryQualityMetrics;
  private readonly workerProbes: Record<HealthWorkerKey, WorkerProbe>;
  private readonly now: () => number;
  private readonly missionWindowHours: number;
  private readonly failureRateWarnThreshold: number;
  private readonly memoryStaleRatioWarnThreshold: number;
  private readonly diskUsageWarnThresholdBytes: number;
  private readonly onAlert: RuntimeHealthMonitorOptions['onAlert'];
  private pollTimer: Timer | null = null;
  private latestSnapshot: SystemHealthSnapshot | null = null;
  private latestAlerts: SystemHealthAlert[] = [];
  private alertFingerprints = new Set<string>();

  constructor(options: RuntimeHealthMonitorOptions) {
    this.store = options.store;
    this.dataDir = options.dataDir;
    this.memoryQualityProvider = options.memoryQualityProvider;
    this.workerProbes = {
      ...DEFAULT_WORKER_PROBES,
      ...(options.workerProbes ?? {}),
    };
    this.now = options.now ?? (() => Date.now());
    this.missionWindowHours = options.missionWindowHours ?? 24;
    this.failureRateWarnThreshold = options.failureRateWarnThreshold ?? 0.4;
    this.memoryStaleRatioWarnThreshold = options.memoryStaleRatioWarnThreshold ?? 0.35;
    this.diskUsageWarnThresholdBytes = options.diskUsageWarnThresholdBytes ?? 2 * 1024 * 1024 * 1024;
    this.onAlert = options.onAlert;
  }

  getLatestSnapshot(): SystemHealthSnapshot | null {
    return this.latestSnapshot;
  }

  listRecentAlerts(limit = 25): SystemHealthAlert[] {
    return this.latestAlerts.slice(0, Math.max(1, limit));
  }

  async evaluateNow(): Promise<SystemHealthSnapshot> {
    const generatedAt = this.now();
    const workerAvailability: WorkerAvailabilityRecord[] = [];
    for (const worker of HEALTH_WORKER_KEYS) {
      const probe = this.workerProbes[worker] ?? DEFAULT_WORKER_PROBES[worker];
      const result = await Promise.resolve(probe());
      workerAvailability.push({
        worker,
        available: result.available,
        detail: result.detail,
        checked_at: generatedAt,
      });
    }

    const memory = this.memoryQualityProvider();
    const windowStart = generatedAt - (this.missionWindowHours * 60 * 60 * 1000);
    const missionStats = this.store.getMissionStatusStatsSince(windowStart);
    const diskBytes = folderSizeBytes(this.dataDir);
    const usageRatio = this.diskUsageWarnThresholdBytes > 0
      ? diskBytes / this.diskUsageWarnThresholdBytes
      : 0;

    const alerts = this.buildAlerts({
      generatedAt,
      workerAvailability,
      memory,
      missionStats,
      diskBytes,
      usageRatio,
    });

    const snapshot: SystemHealthSnapshot = {
      generated_at: generatedAt,
      worker_availability: workerAvailability,
      memory: {
        stale_ratio: memory.stale_ratio,
        stale_candidate_count: memory.stale_candidate_count,
        active_memory_count: memory.active_memory_count,
      },
      missions: {
        window_hours: this.missionWindowHours,
        total_runs: missionStats.total,
        verified_complete: missionStats.verified_complete,
        verification_failed: missionStats.verification_failed,
        rejected: missionStats.rejected,
        failure_rate: missionStats.failed_ratio,
      },
      disk: {
        data_dir: this.dataDir,
        bytes_used: diskBytes,
        threshold_bytes: this.diskUsageWarnThresholdBytes,
        usage_ratio: usageRatio,
      },
      alerts,
    };

    this.latestSnapshot = snapshot;
    if (alerts.length > 0) {
      this.latestAlerts = [...alerts, ...this.latestAlerts].slice(0, 200);
      await this.onAlert?.(alerts, snapshot);
    }
    return snapshot;
  }

  startPolling(intervalMs = 30_000): void {
    if (this.pollTimer) {
      return;
    }
    const effectiveInterval = Math.max(5_000, intervalMs);
    this.pollTimer = setInterval(() => {
      void this.evaluateNow().catch(() => {
        // monitor failures are intentionally isolated to avoid impacting runtime.
      });
    }, effectiveInterval);
    this.pollTimer.unref?.();
  }

  stopPolling(): void {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private buildAlerts(input: {
    generatedAt: number;
    workerAvailability: WorkerAvailabilityRecord[];
    memory: MemoryQualityMetrics;
    missionStats: {
      total: number;
      verified_complete: number;
      verification_failed: number;
      rejected: number;
      failed_ratio: number;
    };
    diskBytes: number;
    usageRatio: number;
  }): SystemHealthAlert[] {
    const alerts: SystemHealthAlert[] = [];
    const emit = (
      kind: HealthAlertKind,
      severity: HealthAlertSeverity,
      sourceKey: string,
      message: string,
    ): void => {
      const fingerprint = `${kind}:${sourceKey}:${message}`;
      if (this.alertFingerprints.has(fingerprint)) {
        return;
      }
      this.alertFingerprints.add(fingerprint);
      alerts.push({
        id: createAlertId(kind, sourceKey, input.generatedAt),
        kind,
        severity,
        message,
        source_key: sourceKey,
        created_at: input.generatedAt,
      });
    };

    for (const worker of input.workerAvailability) {
      if (!worker.available) {
        emit(
          'worker_unavailable',
          worker.worker === 'shell' ? 'critical' : 'warning',
          worker.worker,
          `${worker.worker} worker is unavailable: ${worker.detail}`,
        );
      }
    }

    if (input.memory.stale_ratio >= this.memoryStaleRatioWarnThreshold) {
      emit(
        'memory_staleness',
        input.memory.stale_ratio >= 0.5 ? 'critical' : 'warning',
        'memory_stale_ratio',
        `Memory staleness ratio is ${(input.memory.stale_ratio * 100).toFixed(1)}% (threshold ${(this.memoryStaleRatioWarnThreshold * 100).toFixed(1)}%).`,
      );
    }

    if (input.missionStats.total >= 3 && input.missionStats.failed_ratio >= this.failureRateWarnThreshold) {
      emit(
        'mission_failure_rate',
        input.missionStats.failed_ratio >= 0.6 ? 'critical' : 'warning',
        'mission_failure_rate_24h',
        `Mission failure rate in last ${this.missionWindowHours}h is ${(input.missionStats.failed_ratio * 100).toFixed(1)}% over ${input.missionStats.total} runs.`,
      );
    }

    if (input.diskBytes >= this.diskUsageWarnThresholdBytes) {
      emit(
        'disk_usage',
        input.usageRatio >= 1.2 ? 'critical' : 'warning',
        'data_dir_usage',
        `Data directory usage is ${(input.diskBytes / (1024 * 1024 * 1024)).toFixed(2)}GB (threshold ${(this.diskUsageWarnThresholdBytes / (1024 * 1024 * 1024)).toFixed(2)}GB).`,
      );
    }

    return alerts;
  }
}
