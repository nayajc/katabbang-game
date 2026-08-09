import type { GameView } from '@/game/game';
import { getStrings } from '@/lib/i18n';

/**
 * DOM HUD overlay.
 *
 * With the world rendered by WebGL there is no 2D context left to draw text
 * into, so the HUD moved to DOM — but it is still NOT React state: the numbers
 * change every frame and re-rendering React at 60fps is exactly what the 2D
 * canvas HUD existed to avoid. This class owns its nodes and writes only the
 * values that actually changed since the previous frame.
 *
 * The whole overlay is `pointer-events: none`, so it can never intercept a
 * counter tap. Interactive controls (lane / mute) are separate React buttons.
 */

const GRADE_COLOR: Record<string, string> = {
  perfect: '#ffd93d',
  good: '#7ee787',
  miss: '#ff6b6b',
};

function el(tag: string, css: string): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement;
  node.style.cssText = css;
  return node;
}

export class DomHud {
  private readonly root: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly meta: HTMLDivElement;
  private readonly hearts: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly bannerGrade: HTMLDivElement;
  private readonly bannerGain: HTMLDivElement;

  // Last written values — the whole point is to avoid touching the DOM at 60fps.
  private lastScore = '';
  private lastMeta = '';
  private lastHearts = '';
  private lastFlash = -1;
  private lastVignette = -1;
  private lastPrompt = '';
  private lastBanner = '';

  constructor(parent: HTMLElement) {
    this.root = el(
      'div',
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;' +
        'font-family:system-ui,sans-serif;color:#fff;z-index:2;',
    );

    const topLeft = el(
      'div',
      'position:absolute;top:calc(14px + env(safe-area-inset-top));left:20px;',
    );
    this.score = el('div', 'font-size:34px;font-weight:800;line-height:1.1;');
    this.meta = el('div', 'margin-top:6px;font-size:15px;color:#aab;font-weight:600;');
    topLeft.append(this.score, this.meta);

    this.hearts = el(
      'div',
      'position:absolute;top:calc(14px + env(safe-area-inset-top));right:20px;' +
        'font-size:24px;line-height:1.4;transition:none;',
    );

    this.flash = el(
      'div',
      'position:absolute;inset:0;opacity:0;' +
        'background:radial-gradient(circle at 50% 50%, rgba(255,0,32,0) 20%, rgba(255,24,48,0.72) 100%);',
    );
    this.vignette = el(
      'div',
      'position:absolute;inset:0;opacity:0;' +
        'background:radial-gradient(circle at 50% 58%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.62) 100%);',
    );

    this.prompt = el(
      'div',
      'position:absolute;top:26%;left:0;right:0;text-align:center;' +
        'font-size:28px;font-weight:800;color:#ffffffdd;text-shadow:0 2px 12px #000a;opacity:0;',
    );

    this.banner = el(
      'div',
      'position:absolute;top:38%;left:0;right:0;text-align:center;opacity:0;',
    );
    this.bannerGrade = el(
      'div',
      'font-size:56px;font-weight:900;text-shadow:0 3px 14px #000a;line-height:1.1;',
    );
    this.bannerGain = el('div', 'margin-top:8px;font-size:28px;font-weight:800;');
    this.banner.append(this.bannerGrade, this.bannerGain);

    this.root.append(this.vignette, this.flash, topLeft, this.hearts, this.prompt, this.banner);
    parent.appendChild(this.root);
  }

  update(view: GameView): void {
    const t = getStrings();
    const s = view.score;

    const score = String(Math.floor(s.distance) + Math.floor(s.counterScore));
    if (score !== this.lastScore) {
      this.score.textContent = score;
      this.lastScore = score;
    }

    const meta = `${t.hudJustice} ${s.justice}  ${t.hudCombo} ${s.combo}`;
    if (meta !== this.lastMeta) {
      this.meta.textContent = meta;
      this.lastMeta = meta;
    }

    const hearts = '❤️'.repeat(Math.max(0, s.hp));
    if (hearts !== this.lastHearts) {
      this.hearts.textContent = hearts;
      this.lastHearts = hearts;
    }

    // Hearts pulse and glow red for HIT_FLASH_MS after an hp loss.
    const flash = round2(view.hitFlash);
    if (flash !== this.lastFlash) {
      this.flash.style.opacity = String(flash);
      this.hearts.style.transform = flash > 0.01 ? `scale(${1 + 0.3 * flash})` : '';
      this.hearts.style.filter = flash > 0.01 ? `drop-shadow(0 0 ${18 * flash}px #ff2d3f)` : '';
      this.lastFlash = flash;
    }

    const slowmo = round2(view.fx.slowmo);
    if (slowmo !== this.lastVignette) {
      this.vignette.style.opacity = String(slowmo);
      this.lastVignette = slowmo;
    }

    const prompt = view.phase === 'slowmo' ? t.tapNow : '';
    if (prompt !== this.lastPrompt) {
      this.prompt.textContent = prompt;
      this.prompt.style.opacity = prompt ? '1' : '0';
      this.lastPrompt = prompt;
    }

    this.updateBanner(view);
  }

  private updateBanner(view: GameView): void {
    const showing = view.phase === 'result' && view.lastGrade !== null;
    const t = getStrings();
    const grade = view.lastGrade;
    const text = !showing
      ? ''
      : grade === 'perfect'
        ? t.gradePerfect
        : grade === 'good'
          ? t.gradeGood
          : t.gradeMiss;
    const key = `${text}|${view.lastGain}`;
    if (key !== this.lastBanner) {
      this.bannerGrade.textContent = text;
      this.bannerGrade.style.color = grade ? GRADE_COLOR[grade] : '#fff';
      this.bannerGain.textContent = showing && view.lastGain > 0 ? `+${view.lastGain}` : '';
      this.lastBanner = key;
    }
    if (!showing) {
      if (this.banner.style.opacity !== '0') this.banner.style.opacity = '0';
      return;
    }
    // Same pop/fade curve the 2D result banner used.
    const p = view.resultProgress;
    this.banner.style.opacity = String(round2(1 - p * 0.6));
    this.banner.style.transform = `scale(${round2(1 + 0.25 * (1 - p))})`;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** 2dp quantisation: the DOM only gets written when a value visibly changed. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
