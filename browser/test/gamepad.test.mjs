import assert from 'node:assert/strict';
import { movementAngle, movementVector, pressedButtons, stickAxis } from '../src/gamepad.ts';

const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
assert.deepEqual(movementVector([0.1, -0.1], new Set()), { x: 0, forward: 0 });
assert.deepEqual(movementVector([0.8, -0.8], new Set()), { x: 0.8, forward: 0.8 });
assert.deepEqual(movementVector([0.8, -0.8], new Set([14, 13])), { x: -1, forward: -1 });
buttons[0] = { pressed: true, value: 1 };
buttons[6] = { pressed: false, value: 0.75 };
assert.deepEqual([...pressedButtons(buttons)], [0, 6]);
assert.equal(stickAxis(0.1), 0);
assert.equal(stickAxis(-0.5), -0.5);
assert.equal(movementAngle(1, 0), -Math.PI / 2);
assert.equal(movementAngle(-1, 0), Math.PI / 2);
assert.equal(movementAngle(0, 1), 0);
console.log('Standard gamepad input mapping passed');
