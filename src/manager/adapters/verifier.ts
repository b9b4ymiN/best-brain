import type { VerifierAdapter } from './types.ts';
import type { ExecutionRequest, VerificationRequest, WorkerExecutionResult } from '../types.ts';
import { buildVerificationRequest } from '../reviewer.ts';

export class ManagerVerifierAdapter implements VerifierAdapter {
  async review(request: ExecutionRequest, workerResult: WorkerExecutionResult): Promise<VerificationRequest> {
    return buildVerificationRequest(request.mission_id, workerResult);
  }
}
