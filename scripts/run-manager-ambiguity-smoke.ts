import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Fix it',
    output_mode: 'json',
  });

  if (!result.goal_ambiguity.is_ambiguous) {
    throw new Error('ambiguity smoke expected the goal to be flagged as ambiguous');
  }
  if (result.decision.should_execute) {
    throw new Error('ambiguity smoke expected execution to be blocked');
  }
  if (!result.decision.blocked_reason?.includes('ambiguous')) {
    throw new Error('ambiguity smoke expected a blocked reason that references ambiguity');
  }
  if (result.worker_result != null) {
    throw new Error('ambiguity smoke expected no worker execution');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}
