import { THAI_EQUITIES_DEMO_SCENARIOS, type ThaiEquitiesDemoScenario } from '../src/market/demo.ts';
import { runProvingMission } from '../src/proving/runner.ts';

function parseArgs(argv: string[]): {
  definition_id: string;
  scenario: ThaiEquitiesDemoScenario;
  adapter_id: string;
} {
  let definitionId = '';
  let scenario: ThaiEquitiesDemoScenario = 'success';
  let adapterId = '';

  for (const arg of argv) {
    if (arg.startsWith('--definition=')) {
      definitionId = arg.slice('--definition='.length);
      continue;
    }
    if (arg.startsWith('--scenario=')) {
      const value = arg.slice('--scenario='.length);
      if (!THAI_EQUITIES_DEMO_SCENARIOS.includes(value as ThaiEquitiesDemoScenario)) {
        throw new Error(`Unsupported proving mission scenario: ${value}`);
      }
      scenario = value as ThaiEquitiesDemoScenario;
      continue;
    }
    if (arg.startsWith('--adapter=')) {
      adapterId = arg.slice('--adapter='.length);
      continue;
    }
  }

  if (!definitionId) {
    throw new Error('Missing --definition=<id>');
  }
  if (!adapterId) {
    throw new Error('Missing --adapter=<id>');
  }

  return {
    definition_id: definitionId,
    scenario,
    adapter_id: adapterId,
  };
}

const input = parseArgs(process.argv.slice(2));
const output = runProvingMission(input);
console.log(JSON.stringify(output));
