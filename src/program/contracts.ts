export const PROGRAM_PILLARS = [
  'PersonaBrain',
  'MissionManager',
  'WorkerSwarm',
  'RuntimeOS',
  'ControlSurface',
] as const;

export type ProgramPillar = (typeof PROGRAM_PILLARS)[number];

export const PROGRAM_PHASES = [
  'Phase0_ProgramLock',
  'Phase1_ManagerBeta',
  'Phase2_WorkerFabricRuntimeSpine',
  'Phase3_ProvingMissionFramework',
  'Phase4_DemoAcceptanceMission',
  'Phase5_ActualManagerLedMission',
  'Phase6_Repeatability',
] as const;

export type ProgramPhase = (typeof PROGRAM_PHASES)[number];

export const LONG_TERM_PHASES = [
  'Phase7_FullMissionConsole',
  'Phase8_TaskQuality',
  'Phase9_BrowserMailFlows',
  'Phase10_DualWorkerPatterns',
  'Phase11_RuntimeMaturity',
  'Phase12_OperatorMode',
] as const;

export type LongTermPhase = (typeof LONG_TERM_PHASES)[number];

export const PROGRAM_SUCCESS_BAR = 'Repeatable One-Mission' as const;
export const PROGRAM_PROVING_MISSION = 'Thai equities daily stock scanner' as const;
export const PROGRAM_CONTROL_SURFACE_TARGET = 'Full Mission Console' as const;
export const PROGRAM_EXECUTION_STYLE = 'general_engine_plus_reusable_playbooks' as const;
export const PROGRAM_ACCEPTANCE_RUN_SET = 'thai_equities_daily_controlled_acceptance_runs' as const;

export const PROGRAM_NON_GOALS = [
  'cloud_first_hosting',
  'multi_user_collaboration',
  'telegram_or_mobile_first_surface',
  'mission_specific_helper_scripts',
  'hard_coded_stock_scanner_pipeline',
] as const;

export type ProgramNonGoal = (typeof PROGRAM_NON_GOALS)[number];

export const PROGRAM_MANAGER_BETA_RAILS = [
  'mission_brief_completeness_validator',
  'goal_ambiguity_detector',
] as const;

export type ProgramManagerBetaRail = (typeof PROGRAM_MANAGER_BETA_RAILS)[number];

export const PROGRAM_OPERATING_ASSUMPTIONS = [
  'no_hidden_human_in_the_loop_steps',
] as const;

export type ProgramOperatingAssumption = (typeof PROGRAM_OPERATING_ASSUMPTIONS)[number];

export const PROGRAM_CORE_CONTRACTS = [
  'brain',
  'manager',
  'worker',
  'runtime',
  'console',
  'market_data',
] as const;

export type ProgramCoreContract = (typeof PROGRAM_CORE_CONTRACTS)[number];
