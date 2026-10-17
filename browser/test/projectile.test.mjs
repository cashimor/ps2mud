import assert from 'node:assert/strict';
import { advanceProjectile } from '../src/projectile.ts';

const position = { x: 0, y: 1, z: 0 };
const target = { x: 15, y: 3, z: -15 };
for (let frame = 0; frame < 50; frame++)
  advanceProjectile(position, target, 3, 1 / 60);
assert.deepEqual(position, target, 'diagonal missile reaches both axes before Pike removes it');

const reverse = { x: 0.2, y: 0, z: -0.2 };
advanceProjectile(reverse, { x: 0, y: 0, z: 0 }, 3, 1 / 60);
assert.deepEqual(reverse, { x: 0, y: 0, z: 0 }, 'movement stops at the target');
