import { BestBrain } from '../src/services/brain.ts';

const prompts = [
  'If you were the owner, how should this mission start?',
  'What report format does the owner prefer?',
  'What should happen before claiming the mission is complete?',
];

const brain = await BestBrain.open();

for (const prompt of prompts) {
  const result = await brain.consult({ query: prompt });
  console.log(`\n# Prompt\n${prompt}`);
  console.log('\n# Response');
  console.log(result.answer);
  console.log('\n# Manual rubric');
  console.log('- consult usefulness score: TBD');
  console.log('- answer groundedness score: TBD');
  console.log('- persona alignment score: TBD');
  console.log('- actionability score: TBD');
}

brain.close();
