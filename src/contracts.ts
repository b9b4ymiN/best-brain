export const HTTP_V1_ENDPOINTS = [
  '/health',
  '/brain/consult',
  '/brain/learn',
  '/brain/context',
  '/missions/:id/outcome',
  '/failures',
  '/verification/start',
  '/verification/complete',
  '/preferences/format',
] as const;

export const MCP_V1_TOOLS = [
  'brain_consult',
  'brain_learn',
  'brain_context',
  'brain_save_outcome',
  'brain_save_failure',
  'brain_verify',
] as const;

export const CONTRACT_SEMANTICS = {
  learnPolicyRejectStatusCode: 200,
  malformedRequestStatusCode: 400,
  invalidTransitionStatusCode: 400,
  mcpToolErrorFlag: true,
  additiveOnlyFreeze: true,
} as const;

export const ONBOARDING_MEMORY_TITLES = {
  persona: 'Owner persona',
  reportFormat: 'Preferred report format',
  communicationStyle: 'Communication style',
  qualityBar: 'Quality bar',
  planningPlaybook: 'Planning and verification playbook',
} as const;
