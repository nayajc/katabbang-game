import { expect, test } from '@playwright/test';
import { TUNING } from '@/game/tuning';

/**
 * End-to-end timing proof: play a real session and tap at the instant the
 * counter cue closes — lead <= 0, i.e. the frame the shrinking approach ring
 * lands on the target ring — then assert the judged delta.
 *
 * `data-counter-lead` / `data-last-judge` are the ?debug=1 diagnostics Game
 * publishes; they are the same numbers the debug HUD shows a real player.
 *
 * The whole play loop runs inside ONE page.evaluate on rAF: a Playwright round
 * trip between "the cue closed" and "tap now" is itself tens of ms and would
 * measure the harness rather than the game.
 */

const WANTED = 3;

test('tapping when the counter cue closes grades at least good', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/play?debug=1');
  await page.getByTestId('start-button').click();

  const grades = await page.evaluate(async (wanted: number) => {
    const el = document.querySelector<HTMLElement>('[data-phase]')!;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
    const out: string[] = [];

    // Dispatched straight at the canvas, so the React game-over overlay cannot
    // intercept it. On 'gameover' this same tap restarts the run.
    const tapCentre = () => {
      const r = canvas.getBoundingClientRect();
      const init = {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', init));
    };

    const started = performance.now();
    let pending = false;

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (out.length >= wanted || performance.now() - started > 150_000) return resolve();
        const phase = el.dataset.phase;

        // The judgement lands a frame after the tap.
        if (pending) {
          const judged = el.dataset.lastJudge;
          if (judged) {
            out.push(judged);
            delete el.dataset.lastJudge;
          }
          pending = false;
        } else if (phase === 'gameover') {
          // The harness never dodges pedestrians, so runs end quickly; restart.
          tapCentre();
        } else if (phase === 'slowmo') {
          const lead = Number(el.dataset.counterLead);
          if (Number.isFinite(lead) && lead <= 0) {
            tapCentre();
            pending = true;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, WANTED);

  console.log(`counter timing at cue-close: ${grades.join(', ')}`);
  expect(grades.length, 'judged encounters').toBe(WANTED);

  for (const judged of grades) {
    const [grade, delta] = judged.split(':');
    expect(Math.abs(Number(delta)), `delta for ${judged}`).toBeLessThanOrEqual(TUNING.GOOD_MS);
    expect(grade, `grade for ${judged}`).not.toBe('miss');
  }
});
