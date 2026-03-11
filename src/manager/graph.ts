import type { WorkerId } from '../workers/types.ts';
import type { MissionBrief } from './types.ts';

export const MISSION_NODE_TYPES = [
  'analysis',
  'data_selection',
  'implementation',
  'execution',
  'verification',
  'report',
  'repair',
] as const;

export type MissionNodeType = (typeof MISSION_NODE_TYPES)[number];

export const MISSION_TASK_STATUSES = [
  'pending',
  'ready',
  'running',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const;

export type MissionTaskStatus = (typeof MISSION_TASK_STATUSES)[number];

export interface MissionTaskNode {
  id: string;
  title: string;
  objective: string;
  node_type: MissionNodeType;
  assigned_worker: WorkerId | null;
  depends_on: string[];
  status: MissionTaskStatus;
  verification_gate: boolean;
  retry_count: number;
  artifact_ids: string[];
}

export interface MissionTaskGraph {
  mission_id: string;
  mission_kind: string;
  playbook_id: string;
  nodes: MissionTaskNode[];
  created_at: number;
  updated_at: number;
}

export function buildMissionTaskGraph(brief: MissionBrief): MissionTaskGraph {
  const now = Date.now();

  if (brief.kind === 'chat') {
    return recomputeMissionGraph({
      mission_id: brief.mission_id,
      mission_kind: brief.mission_kind,
      playbook_id: brief.playbook.id,
      created_at: now,
      updated_at: now,
      nodes: [
        {
          id: 'context_review',
          title: 'Review consult guidance',
          objective: 'Ground the answer in persona and current context.',
          node_type: 'analysis',
          assigned_worker: null,
          depends_on: [],
          status: 'pending',
          verification_gate: false,
          retry_count: 0,
          artifact_ids: [],
        },
        {
          id: 'final_response',
          title: 'Prepare the final response',
          objective: `Return a grounded response or next action in the preferred format: ${brief.playbook.report_format}`,
          node_type: 'report',
          assigned_worker: null,
          depends_on: ['context_review'],
          status: 'pending',
          verification_gate: false,
          retry_count: 0,
          artifact_ids: [],
        },
      ],
    });
  }

  const orderedWorkers = Array.from(new Set([
    brief.selected_worker,
    ...brief.playbook.preferred_workers,
  ])).filter((worker): worker is WorkerId => worker != null && worker !== 'verifier');
  const workerNodeType = (worker: WorkerId): MissionNodeType => (
    worker === 'codex'
      ? 'implementation'
      : worker === 'shell' || worker === 'browser' || worker === 'mail'
        ? 'execution'
        : 'analysis'
  );
  const requiresDataSelection = brief.input_adapter_decisions.some((decision) => decision.decision !== 'not_required');
  const firstWorkerDependsOn = requiresDataSelection ? ['data_selection'] : ['context_review'];
  const nodes: MissionTaskNode[] = [
    {
      id: 'context_review',
      title: 'Review consult and context',
      objective: 'Ground the mission in persona, mission history, and current policy rails.',
      node_type: 'analysis',
      assigned_worker: null,
      depends_on: [],
      status: 'pending',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: [],
    },
  ];

  if (requiresDataSelection) {
    nodes.push({
      id: 'data_selection',
      title: 'Resolve mission inputs and data adapters',
      objective: `Select input adapters for: ${brief.input_adapter_decisions.map((decision) => decision.input_id).join(' | ')}`,
      node_type: 'data_selection',
      assigned_worker: null,
      depends_on: ['context_review'],
      status: 'pending',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: [],
    });
  }

  const workerNodes: MissionTaskNode[] = orderedWorkers.map((worker, index) => {
    const nodeId = index === 0 ? 'primary_work' : `secondary_work_${index}`;
    const dependsOn = index === 0
      ? firstWorkerDependsOn
      : [index === 1 ? 'primary_work' : `secondary_work_${index - 1}`];
    return {
      id: nodeId,
      title: index === 0
        ? 'Execute the primary worker'
        : `Execute secondary worker ${index}`,
      objective: `Run ${worker} against the compiled mission brief.`,
      node_type: workerNodeType(worker),
      assigned_worker: worker,
      depends_on: dependsOn,
      status: 'pending',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: [],
    };
  });
  const verificationDependsOn = workerNodes.length === 0
    ? ['context_review']
    : [workerNodes[workerNodes.length - 1]!.id];

  return recomputeMissionGraph({
    mission_id: brief.mission_id,
    mission_kind: brief.mission_kind,
    playbook_id: brief.playbook.id,
    created_at: now,
    updated_at: now,
    nodes: [
      ...nodes,
      ...workerNodes,
      {
        id: 'verification_gate',
        title: 'Run verification gate',
        objective: `Prove the result with checklist: ${brief.playbook.verifier_checklist.map((item) => item.name).join(' | ')}`,
        node_type: 'verification',
        assigned_worker: 'verifier',
        depends_on: verificationDependsOn,
        status: 'pending',
        verification_gate: true,
        retry_count: 0,
        artifact_ids: [],
      },
      {
        id: 'final_report',
        title: 'Prepare final owner report',
        objective: `Summarize the result for the owner using format: ${brief.playbook.report_format}`,
        node_type: 'report',
        assigned_worker: null,
        depends_on: ['verification_gate'],
        status: 'pending',
        verification_gate: false,
        retry_count: 0,
        artifact_ids: [],
      },
    ],
  });
}

function dependenciesSatisfied(graph: MissionTaskGraph, node: MissionTaskNode): boolean {
  return node.depends_on.every((dependencyId) => graph.nodes.some((candidate) => candidate.id === dependencyId && candidate.status === 'completed'));
}

export function recomputeMissionGraph(graph: MissionTaskGraph): MissionTaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.status === 'pending' && dependenciesSatisfied(graph, node)) {
        return { ...node, status: 'ready' };
      }
      if (node.status === 'ready' && !dependenciesSatisfied(graph, node)) {
        return { ...node, status: 'blocked' };
      }
      if (node.status === 'blocked' && dependenciesSatisfied(graph, node)) {
        return { ...node, status: 'ready' };
      }
      return node;
    }),
    updated_at: Date.now(),
  };
}

export function getReadyTaskNodes(graph: MissionTaskGraph): MissionTaskNode[] {
  return graph.nodes.filter((node) => node.status === 'ready');
}

export function updateTaskStatus(graph: MissionTaskGraph, taskId: string, status: MissionTaskStatus, artifactIds: string[] = []): MissionTaskGraph {
  const nextGraph: MissionTaskGraph = {
    ...graph,
    nodes: graph.nodes.map((node) => (
      node.id === taskId
        ? {
            ...node,
            status,
            artifact_ids: artifactIds.length > 0 ? Array.from(new Set([...node.artifact_ids, ...artifactIds])) : node.artifact_ids,
            retry_count: status === 'failed' ? node.retry_count + 1 : node.retry_count,
          }
        : node
    )),
    updated_at: Date.now(),
  };

  return recomputeMissionGraph(nextGraph);
}
