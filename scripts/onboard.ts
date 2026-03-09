import fs from 'fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { BestBrain } from '../src/services/brain.ts';
import { getOnboardingDefaults, runOnboarding, type OnboardingAnswers } from '../src/services/onboarding.ts';

function parseArgs(argv: string[]): { jsonPath: string | null; yes: boolean } {
  let jsonPath: string | null = null;
  let yes = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      jsonPath = argv[index + 1] ?? null;
      index += 1;
    } else if (value === '--yes') {
      yes = true;
    }
  }

  return { jsonPath, yes };
}

async function promptForAnswer(
  rl: readline.Interface,
  label: string,
  currentValue: string,
): Promise<string> {
  const answer = await rl.question(`${label}\n[current] ${currentValue}\n> `);
  return answer.trim() || currentValue;
}

const args = parseArgs(process.argv.slice(2));
const brain = await BestBrain.open();

try {
  const defaults = getOnboardingDefaults(brain);
  const snapshot = brain.getOnboardingSnapshot();
  let answers: OnboardingAnswers;

  if (args.jsonPath) {
    answers = JSON.parse(fs.readFileSync(args.jsonPath, 'utf8')) as OnboardingAnswers;
  } else {
    if (!process.stdin.isTTY) {
      throw new Error('interactive onboarding requires a TTY or --json <path>');
    }

    console.log(JSON.stringify({
      completed: snapshot.completed,
      current: snapshot,
    }, null, 2));

    const rl = readline.createInterface({ input, output });
    try {
      answers = {
        ownerPersona: await promptForAnswer(rl, 'Owner identity / persona', defaults.ownerPersona),
        preferredReportFormat: await promptForAnswer(rl, 'Preferred report / output format', defaults.preferredReportFormat),
        communicationStyle: await promptForAnswer(rl, 'Communication style', defaults.communicationStyle),
        qualityBar: await promptForAnswer(rl, 'Quality bar', defaults.qualityBar),
        planningPlaybook: await promptForAnswer(rl, 'Planning and verification playbook', defaults.planningPlaybook),
      };

      if (!args.yes) {
        const confirm = await rl.question('Apply these onboarding updates? [y/N] ');
        if (!['y', 'yes'].includes(confirm.trim().toLowerCase())) {
          console.log('Onboarding aborted.');
          process.exit(1);
        }
      }
    } finally {
      rl.close();
    }
  }

  const result = await runOnboarding(brain, answers);
  console.log(JSON.stringify({
    completed: result.completed,
    health: brain.health(),
    results: result.results,
  }, null, 2));
} finally {
  brain.close();
}
