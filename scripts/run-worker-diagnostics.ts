import { WorkerDiagnosticsService } from '../src/runtime/worker-diagnostics.ts';

const diagnostics = new WorkerDiagnosticsService();
const snapshot = await diagnostics.collect();

console.log(JSON.stringify(snapshot, null, 2));
