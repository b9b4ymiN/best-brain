import type {
  CompletionProofState,
  ConsultRequest,
  ConsultResponse,
  FailureInput,
  LearnRequest,
  LearnResult,
  MissionContextBundle,
  StrictMissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../../types.ts';
import type {
  ExecutionRequest,
  VerificationRequest,
  WorkerExecutionResult,
} from '../types.ts';

export interface BrainHealthResponse {
  status: 'ok';
  db_path: string;
  seeded: boolean;
  onboarded: boolean;
}

export interface BrainAdapter {
  ensureAvailable(): Promise<BrainHealthResponse>;
  wasStartedByAdapter(): boolean;
  consult(request: ConsultRequest): Promise<ConsultResponse>;
  learn(request: LearnRequest): Promise<LearnResult>;
  context(params: { mission_id?: string | null; domain?: string | null; query?: string | null }): Promise<MissionContextBundle>;
  saveOutcome(input: StrictMissionOutcomeInput): Promise<{
    mission: { id: string; status: string };
    learn_result: { accepted: boolean; memory_id: string | null };
    proof_state: CompletionProofState | null;
  }>;
  saveFailure(input: FailureInput): Promise<LearnResult>;
  startVerification(input: VerificationStartInput): Promise<CompletionProofState>;
  completeVerification(input: VerificationCompleteInput): Promise<CompletionProofState>;
  dispose(): Promise<void>;
}

export interface WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  execute(request: ExecutionRequest): Promise<WorkerExecutionResult>;
}

export interface VerifierAdapter {
  review(request: ExecutionRequest, workerResult: WorkerExecutionResult): Promise<VerificationRequest>;
}
