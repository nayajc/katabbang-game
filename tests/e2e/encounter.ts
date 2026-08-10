import type { Page } from '@playwright/test';

/**
 * Shared "get me to a counter window" driver.
 *
 * Reaching a bumper encounter is spawn-RNG bound and expensive: the idle harness
 * never dodges, so a run usually ends on a pedestrian long before the bumper
 * spawn rate has ramped up, and it takes ~50s of restarts on average before one
 * engages in the player's lane.
 *
 * TWO things here are load-critical, and both were learned the hard way from
 * flakes that only appeared in a fully parallel suite run:
 *
 * 1. The hunt runs entirely on rAF INSIDE the page. A per-frame Playwright round
 *    trip is tens of ms, and under load a polling loop is slow enough to burn
 *    its whole budget without ever catching an encounter.
 *
 * 2. It only resolves once `data-counter-lead` shows at least `minLeadMs` of
 *    window left. An armed window that merely TIMES OUT resolves as a miss and
 *    leaves slowmo exactly like a counter does, so any assertion made after a
 *    Playwright round trip needs slack, or an expiry gets blamed on the input
 *    under test.
 *
 * REQUIRES `?debug=1` — that is what publishes `data-counter-lead`.
 *
 * On success `data-last-judge` has been cleared, so the caller's next read of it
 * can only be the judgement of the input the caller is testing.
 */
export type Encounter = {
  /** `data-player-lane` at the moment the window was found. */
  lane: string;
};

export async function huntCounterWindow(
  page: Page,
  minLeadMs = 400,
  budgetMs = 260_000,
): Promise<Encounter | null> {
  return page.evaluate(
    async ([minLead, budget]) => {
      const node = document.querySelector<HTMLElement>('[data-phase]')!;
      const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;

      // Dispatched at the canvas so the React game-over overlay cannot intercept
      // it; on 'gameover' this tap restarts the run.
      const restart = () => {
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
      return new Promise<{ lane: string } | null>((resolve) => {
        const tick = () => {
          if (performance.now() - started > budget) return resolve(null);
          const phase = node.dataset.phase;
          const lane = canvas.dataset.playerLane;
          if (phase === 'gameover') restart();
          else if (phase === 'slowmo' && Number(node.dataset.counterLead) > minLead && lane) {
            // Earlier windows in the hunt expired as misses and left their
            // judgement behind; clear it in-page (no round trip, no slack spent)
            // so the caller's next read can only be its own press.
            delete node.dataset.lastJudge;
            return resolve({ lane });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    [minLeadMs, budgetMs] as const,
  );
}
