/**
 * The pointer spotlight on cards.
 *
 * One listener for the whole document rather than one per card: it finds the
 * card under the pointer and writes the pointer's position onto it as two CSS
 * variables, and the stylesheet does the rest. Throttled to a frame, because
 * `pointermove` fires far faster than the screen redraws.
 *
 * Purely decorative, so it stays out of the way: nothing is installed on a
 * touch device (the light would stick where the last tap landed) or when the
 * person has asked for reduced motion, and the CSS that draws it is behind the
 * same two conditions.
 */

const QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export function installSpotlight(root = document) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  if (!window.matchMedia(QUERY).matches) return () => {};

  let frame = 0;
  let last = null;

  const paint = () => {
    frame = 0;
    if (!last) return;
    const card = last.target?.closest?.('[data-spot]');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${last.x - rect.left}px`);
    card.style.setProperty('--my', `${last.y - rect.top}px`);
  };

  const onMove = (event) => {
    last = { target: event.target, x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  };

  root.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    root.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
  };
}
