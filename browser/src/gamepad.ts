type Button = { pressed: boolean; value: number };

export function pressedButtons(buttons: readonly Button[]): Set<number> {
  const pressed = new Set<number>();
  buttons.forEach((button, index) => {
    if (button.pressed || button.value >= 0.6) pressed.add(index);
  });
  return pressed;
}

export function movementVector(axes: readonly number[], pressed: ReadonlySet<number>):
    { x: number; forward: number } {
  const x = Number(pressed.has(15)) - Number(pressed.has(14));
  const forward = Number(pressed.has(12)) - Number(pressed.has(13));
  if (x || forward) return { x, forward };
  const stickX = axes[0] ?? 0;
  const stickForward = -(axes[1] ?? 0);
  return Math.hypot(stickX, stickForward) >= 0.28
    ? { x: stickX, forward: stickForward } : { x: 0, forward: 0 };
}

export function stickAxis(value: number | undefined): number {
  return Math.abs(value ?? 0) >= 0.18 ? value! : 0;
}

// The PS2 client's rightward pad input selects west from its default camera
// angle. This sign keeps a rightward stick push moving right on the screen.
export function movementAngle(x: number, forward: number): number {
  return Math.atan2(x === 0 ? 0 : -x, forward);
}
