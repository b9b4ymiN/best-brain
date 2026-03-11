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

  const primaryNodeType: MissionNodeType = brief.selected_worker === 'codex'
    ? 'implementation'
    : brief.selected_worker === 'shell' || brief.selected_worker === 'browser' || brief.selected_worker === 'mail'
      ? 'execution'
      : 'analysis';
  const primaryWorker: WorkerId | null = brief.selected_worker;
  const requiresDataSelection = brief.input_adapter_decisions.some((decision) => decision.decision !== 'not_required');
  const primaryDependsOn = requiresDataSelection ? ['data_selection'] : ['context_review'];
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

  return recomputeMissionGraph({
    mission_id: brief.mission_id,
    mission_kind: brief.mission_kind,
    playbook_id: brief.playbook.id,
    created_at: now,
    updated_at: now,
    nodes: [
      ...nodes,
      {
        id: 'primary_work',
        title: 'Execute the primary worker',
        objective: `Run ${primaryWorker ?? 'the selected worker'} against the compiled mission brief.`,
        node_type: primaryNodeType,
        assigned_worker: primaryWorker,
        depends_on: primaryDependsOn,
        status: 'pending',
        verification_gate: false,
        retry_count: 0,
        artifact_ids: [],
      },
      {
        id: 'verification_gate',
        title: 'Run verification gate',
        objective: `Prove the result with checklist: ${brief.playbook.verifier_checklist.map((item) => item.name).join(' | ')}`,
        node_type: 'verification',
        assigned_worker: 'verifier',
        depends_on: ['primary_work'],
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
