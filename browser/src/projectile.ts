type Position = { x: number; y: number; z: number };

// The PS2 blob moves each coordinate independently by 0.1 * speed per 60 Hz frame.
export function advanceProjectile(position: Position, target: Position,
    speed: number, delta: number): void {
  const step = delta * 6 * speed;
  for (const axis of ['x', 'y', 'z'] as const) {
    const gap = target[axis] - position[axis];
    position[axis] += Math.sign(gap) * Math.min(Math.abs(gap), step);
  }
}
