import { BestBrain } from '../src/services/brain.ts';

const brain = await BestBrain.open();
console.log(JSON.stringify(brain.health(), null, 2));
brain.close();
