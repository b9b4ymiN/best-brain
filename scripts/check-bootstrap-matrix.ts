import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const requireAll = args.includes('--require-all');
const proofDirArgIndex = args.indexOf('--proof-dir');
const proofDir = proofDirArgIndex >= 0
  ? path.resolve(process.cwd(), args[proofDirArgIndex + 1] ?? 'artifacts/bootstrap-proofs')
  : path.resolve(process.cwd(), 'artifacts/bootstrap-proofs');

const requiredTargets = ['windows', 'macos', 'linux'] as const;
type BootstrapTarget = (typeof requiredTargets)[number];

function normalizeBootstrapTarget(value: string): BootstrapTarget | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'windows' || normalized === 'win32') {
    return 'windows';
  }
  if (normalized === 'macos' || normalized === 'darwin' || normalized === 'mac') {
    return 'macos';
  }
  if (normalized === 'linux') {
    return 'linux';
  }
  return null;
}

const discovered = new Set<BootstrapTarget>();

if (fs.existsSync(proofDir)) {
  for (const entry of fs.readdirSync(proofDir)) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    const stem = path.basename(entry, '.json');
    const target = normalizeBootstrapTarget(stem);
    if (target != null) {
      discovered.add(target);
      continue;
    }

    const fullPath = path.join(proofDir, entry);
    try {
      const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { os_label?: string | null };
      const fromPayload = typeof payload.os_label === 'string'
        ? normalizeBootstrapTarget(payload.os_label)
        : null;
      if (fromPayload != null) {
        discovered.add(fromPayload);
      }
    } catch {
      // Ignore malformed files in this utility.
    }
  }
}

const missing = requiredTargets.filter((target) => !discovered.has(target));
const summary = {
  proof_dir: proofDir,
  required_targets: requiredTargets,
  captured_targets: requiredTargets.filter((target) => discovered.has(target)),
  missing_targets: missing,
  coverage_percent: Math.round((discovered.size / requiredTargets.length) * 100),
  require_all: requireAll,
};

console.log(JSON.stringify(summary, null, 2));

if (requireAll && missing.length > 0) {
  process.exitCode = 1;
}
