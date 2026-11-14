// Module-resolution hook for the player smoke: the browser-only modules player.js imports are swapped for the stubs in ./stubs.
const STUBS = { 'player-staff.js': 'staff.mjs', 'voicing-keyboard.js': 'keyboard.mjs', 'cycle-of-shells-input.js': 'input.mjs', 'voicing-player.js': 'voicing-player.mjs' };
export function resolve(spec, ctx, next) {
  const stub = STUBS[spec.split('/').pop()];
  if (stub && !(ctx.parentURL || '').includes('/tests/player/stubs/')) return { url: new URL('./stubs/' + stub, import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
