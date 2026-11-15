/**
 * Bot QA Auto-Playtester 60 FPS — Brawl Collège : Opération 6ème
 * - Boucle requestAnimationFrame haute précision mesurant FPS actuel/moyen/min et frame drops (>25 ms)
 * - Pilote un joueur complet via l'adaptateur découplé IPlaytestTargetAdapter :
 *   * Stick gauche : orbite tactique autour du centre + évitement des bords et obstacles
 *   * Stick droit : visée vers cible QCM avec taux de réussite configurable (défaut 85%)
 *   * Déclenchement tir, Super dès jauge >= 100%, et Gadget périodique
 * - Capture les erreurs JS (window error / unhandledrejection) et l'usage mémoire (performance.memory)
 * - Panneau HUD Debug flottant activable via bouton ou touche F9 + export rapport JSON QA
 */

export interface IPlaytestVec2 {
  x: number;
  y: number;
}

export interface IPlaytestObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IPlaytestTarget {
  id: string;
  x: number;
  y: number;
  isCorrect: boolean;
  radius?: number;
  label?: string;
}

export interface IPlaytestPlayerState {
  x: number;
  y: number;
  arenaWidth: number;
  arenaHeight: number;
  hp: number;
  maxHp: number;
  ammoBars: number;
  superGaugePct: number;
  gadgetCharges: number;
  isAlive?: boolean;
}

export interface IPlaytestFireCommand {
  angle: number;
  autoAim: boolean;
  targetWorldPos?: IPlaytestVec2;
}

export interface IPlaytestTargetAdapter {
  getPlayerState(): IPlaytestPlayerState;
  getActiveTargets(): ReadonlyArray<IPlaytestTarget>;
  getObstacles?(): ReadonlyArray<IPlaytestObstacle>;
  getCurrentQuestionId?(): string | null;
  applyLeftStick(moveVector: IPlaytestVec2): void;
  applyRightStickAim(angleRad: number, targetWorldPos?: IPlaytestVec2): void;
  triggerFire(command: IPlaytestFireCommand): void;
  triggerSuper(): void;
  triggerGadget(): void;
}

export interface ICapturedJsError {
  kind: 'error' | 'unhandledrejection';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  timestampIso: string;
}

export interface IPlaytestMemorySnapshot {
  usedJSHeapSizeMb: number;
  totalJSHeapSizeMb: number;
  jsHeapSizeLimitMb: number;
}

export interface IAutoPlaytestReport {
  startedAtIso: string;
  generatedAtIso: string;
  running: boolean;
  adapterMode: 'ENGINE_ADAPTER' | 'VIRTUAL_FALLBACK';
  targetAccuracyConfigured: number;
  fpsCurrent: number;
  fpsAverage: number;
  fpsMin: number;
  frameDropsOver25ms: number;
  totalFrames: number;
  elapsedSec: number;
  avgFrameDeltaMs: number;
  maxFrameDeltaMs: number;
  shotsFired: number;
  questionsResolved: number;
  correctAnswers: number;
  wrongAnswers: number;
  successRatePct: number;
  supersTriggered: number;
  gadgetsTriggered: number;
  jsErrorsCount: number;
  jsErrors: ICapturedJsError[];
  memoryUsageMb: IPlaytestMemorySnapshot | null;
}

export interface IAutoPlaytestBotOptions {
  adapter?: IPlaytestTargetAdapter | null;
  targetAccuracyRate?: number;
  fireIntervalMs?: number;
  gadgetIntervalMs?: number;
  toggleKey?: string;
  enableKeyboardShortcut?: boolean;
  onReportUpdate?: (report: IAutoPlaytestReport) => void;
  onStateChange?: (running: boolean) => void;
}

export interface IDebugOverlayHandle {
  element: HTMLElement;
  refresh: () => void;
  unmount: () => void;
}

interface IPerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface IPerformanceWithMemory extends Performance {
  memory?: IPerformanceMemory;
}

const DEFAULT_ARENA_WIDTH = 960;
const DEFAULT_ARENA_HEIGHT = 640;

class VirtualSandboxPlaytestAdapter implements IPlaytestTargetAdapter {
  private playerX = DEFAULT_ARENA_WIDTH * 0.5;
  private playerY = DEFAULT_ARENA_HEIGHT * 0.72;
  private moveVector: IPlaytestVec2 = { x: 0, y: 0 };
  private superGaugePct = 0;
  private gadgetCharges = 3;
  private ammoBars = 3;
  private questionCounter = 1;
  private targets: IPlaytestTarget[] = [];
  private lastStepTime = performance.now();

  private readonly obstacles: IPlaytestObstacle[] = [
    { x: 240, y: 260, width: 90, height: 48 },
    { x: 630, y: 260, width: 90, height: 48 },
  ];

  constructor() {
    this.spawnQuestionWave();
  }

  public getPlayerState(): IPlaytestPlayerState {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastStepTime) / 1000));
    this.lastStepTime = now;

    this.playerX = Math.max(40, Math.min(DEFAULT_ARENA_WIDTH - 40, this.playerX + this.moveVector.x * 260 * dt));
    this.playerY = Math.max(40, Math.min(DEFAULT_ARENA_HEIGHT - 40, this.playerY + this.moveVector.y * 260 * dt));
    this.ammoBars = Math.min(3, this.ammoBars + dt * 0.9);

    return {
      x: this.playerX,
      y: this.playerY,
      arenaWidth: DEFAULT_ARENA_WIDTH,
      arenaHeight: DEFAULT_ARENA_HEIGHT,
      hp: 3200,
      maxHp: 3200,
      ammoBars: Math.floor(this.ammoBars),
      superGaugePct: this.superGaugePct,
      gadgetCharges: this.gadgetCharges,
      isAlive: true,
    };
  }

  public getActiveTargets(): ReadonlyArray<IPlaytestTarget> {
    return this.targets;
  }

  public getObstacles(): ReadonlyArray<IPlaytestObstacle> {
    return this.obstacles;
  }

  public getCurrentQuestionId(): string {
    return `QA_VIRT_${this.questionCounter}`;
  }

  public applyLeftStick(moveVector: IPlaytestVec2): void {
    this.moveVector = moveVector;
  }

  public applyRightStickAim(_angleRad: number, _targetWorldPos?: IPlaytestVec2): void {
    // Suivi visuel virtuel sans rendu DOM requis
  }

  public triggerFire(command: IPlaytestFireCommand): void {
    if (this.ammoBars < 1) {
      return;
    }
    this.ammoBars = Math.max(0, this.ammoBars - 1);

    const hitTarget = this.findHitTarget(command);
    if (hitTarget?.isCorrect) {
      this.superGaugePct = Math.min(100, this.superGaugePct + 40);
      this.questionCounter += 1;
      this.spawnQuestionWave();
    } else if (hitTarget) {
      this.questionCounter += 1;
      this.spawnQuestionWave();
    }
  }

  public triggerSuper(): void {
    if (this.superGaugePct < 100) {
      return;
    }
    this.superGaugePct = 0;
    this.questionCounter += 1;
    this.spawnQuestionWave();
  }

  public triggerGadget(): void {
    if (this.gadgetCharges <= 0) {
      return;
    }
    this.gadgetCharges -= 1;
  }

  private findHitTarget(command: IPlaytestFireCommand): IPlaytestTarget | undefined {
    if (command.targetWorldPos) {
      let closest: IPlaytestTarget | undefined;
      let bestDist = Infinity;
      for (const target of this.targets) {
        const d = Math.hypot(target.x - command.targetWorldPos.x, target.y - command.targetWorldPos.y);
        if (d < bestDist) {
          bestDist = d;
          closest = target;
        }
      }
      if (closest && bestDist <= 80) {
        return closest;
      }
    }

    const dirX = Math.cos(command.angle);
    const dirY = Math.sin(command.angle);
    let bestTarget: IPlaytestTarget | undefined;
    let bestAlign = -1;
    for (const target of this.targets) {
      const dx = target.x - this.playerX;
      const dy = target.y - this.playerY;
      const len = Math.hypot(dx, dy) || 1;
      const align = (dx / len) * dirX + (dy / len) * dirY;
      if (align > bestAlign) {
        bestAlign = align;
        bestTarget = target;
      }
    }
    return bestTarget;
  }

  private spawnQuestionWave(): void {
    const correctIndex = this.questionCounter % 4;
    const positions: IPlaytestVec2[] = [
      { x: 180, y: 150 },
      { x: 390, y: 120 },
      { x: 580, y: 120 },
      { x: 780, y: 150 },
    ];
    this.targets = positions.map((pos, idx) => ({
      id: `virt-target-${this.questionCounter}-${idx}`,
      x: pos.x,
      y: pos.y,
      radius: 26,
      isCorrect: idx === correctIndex,
      label: idx === correctIndex ? '56' : `${42 + idx * 7}`,
    }));
  }
}

export class AutoPlaytestBot {
  private externalAdapter: IPlaytestTargetAdapter | null;
  private readonly fallbackAdapter = new VirtualSandboxPlaytestAdapter();
  private targetAccuracyRate: number;
  private readonly fireIntervalMs: number;
  private readonly gadgetIntervalMs: number;
  private readonly toggleKey: string;
  private readonly onReportUpdate?: (report: IAutoPlaytestReport) => void;
  private readonly onStateChange?: (running: boolean) => void;

  private running = false;
  private rafId: number | null = null;
  private shortcutBound = false;
  private errorListenersBound = false;

  private startedAtIso = new Date().toISOString();
  private startPerfMs = 0;
  private lastFramePerfMs = 0;
  private totalFrames = 0;
  private elapsedSec = 0;
  private totalFrameDeltaMs = 0;
  private maxFrameDeltaMs = 0;
  private fpsCurrent = 0;
  private fpsMin = Infinity;
  private frameDropsOver25ms = 0;

  private orbitAngle = 0;
  private smoothedMove: IPlaytestVec2 = { x: 0, y: 0 };
  private lastFirePerfMs = 0;
  private lastSuperPerfMs = 0;
  private lastGadgetPerfMs = 0;

  private currentTargetId: string | null = null;
  private lastSeenQuestionId: string | null = null;
  private pendingShotQuestionId: string | null = null;
  private pendingShotExpectedCorrect: boolean | null = null;
  private externalResolutionMode = false;

  private shotsFired = 0;
  private questionsResolved = 0;
  private correctAnswers = 0;
  private wrongAnswers = 0;
  private supersTriggered = 0;
  private gadgetsTriggered = 0;
  private readonly jsErrors: ICapturedJsError[] = [];

  private debugOverlay: IDebugOverlayHandle | null = null;

  constructor(options: IAutoPlaytestBotOptions = {}) {
    this.externalAdapter = options.adapter ?? null;
    this.targetAccuracyRate = this.clampRate(options.targetAccuracyRate ?? 0.85);
    this.fireIntervalMs = Math.max(120, options.fireIntervalMs ?? 420);
    this.gadgetIntervalMs = Math.max(1500, options.gadgetIntervalMs ?? 8000);
    this.toggleKey = options.toggleKey ?? 'F9';
    this.onReportUpdate = options.onReportUpdate;
    this.onStateChange = options.onStateChange;

    if (options.enableKeyboardShortcut !== false && typeof window !== 'undefined') {
      this.bindKeyboardShortcut();
    }
  }

  public setAdapter(adapter: IPlaytestTargetAdapter | null): void {
    this.externalAdapter = adapter;
    this.currentTargetId = null;
    this.lastSeenQuestionId = null;
    this.pendingShotQuestionId = null;
    this.pendingShotExpectedCorrect = null;
    this.externalResolutionMode = false;
  }

  public setTargetAccuracy(rate: number): void {
    this.targetAccuracyRate = this.clampRate(rate);
  }

  public getTargetAccuracy(): number {
    return this.targetAccuracyRate;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public start(): void {
    if (this.running || typeof window === 'undefined') {
      return;
    }

    this.resetMetrics();
    this.running = true;
    this.startedAtIso = new Date().toISOString();
    this.startPerfMs = performance.now();
    this.lastFramePerfMs = this.startPerfMs;
    this.lastFirePerfMs = this.startPerfMs - this.fireIntervalMs;
    this.lastSuperPerfMs = 0;
    this.lastGadgetPerfMs = this.startPerfMs;

    this.attachErrorCapture();
    this.onStateChange?.(true);
    this.debugOverlay?.refresh();

    this.rafId = window.requestAnimationFrame(this.tick);
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.getActiveAdapter().applyLeftStick({ x: 0, y: 0 });
    this.detachErrorCapture();
    this.onStateChange?.(false);
    this.onReportUpdate?.(this.getReport());
    this.debugOverlay?.refresh();
  }

  public toggle(): boolean {
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
    return this.running;
  }

  public resetMetrics(): void {
    this.totalFrames = 0;
    this.elapsedSec = 0;
    this.totalFrameDeltaMs = 0;
    this.maxFrameDeltaMs = 0;
    this.fpsCurrent = 0;
    this.fpsMin = Infinity;
    this.frameDropsOver25ms = 0;
    this.shotsFired = 0;
    this.questionsResolved = 0;
    this.correctAnswers = 0;
    this.wrongAnswers = 0;
    this.supersTriggered = 0;
    this.gadgetsTriggered = 0;
    this.jsErrors.length = 0;
    this.currentTargetId = null;
    this.lastSeenQuestionId = null;
    this.pendingShotQuestionId = null;
    this.pendingShotExpectedCorrect = null;
    this.externalResolutionMode = false;
  }

  public notifyQuestionResolved(isCorrect: boolean): void {
    this.externalResolutionMode = true;
    this.questionsResolved += 1;
    if (isCorrect) {
      this.correctAnswers += 1;
    } else {
      this.wrongAnswers += 1;
    }
    this.pendingShotQuestionId = null;
    this.pendingShotExpectedCorrect = null;
  }

  public getReport(): IAutoPlaytestReport {
    const fpsAverage =
      this.elapsedSec > 0 && this.totalFrames > 0 ? this.totalFrames / this.elapsedSec : 0;
    const avgFrameDeltaMs =
      this.totalFrames > 0 ? this.totalFrameDeltaMs / this.totalFrames : 0;
    const resolved = this.questionsResolved;
    const successRatePct = resolved > 0 ? (this.correctAnswers / resolved) * 100 : 0;

    return {
      startedAtIso: this.startedAtIso,
      generatedAtIso: new Date().toISOString(),
      running: this.running,
      adapterMode: this.externalAdapter ? 'ENGINE_ADAPTER' : 'VIRTUAL_FALLBACK',
      targetAccuracyConfigured: Math.round(this.targetAccuracyRate * 100) / 100,
      fpsCurrent: Math.round(this.fpsCurrent * 10) / 10,
      fpsAverage: Math.round(fpsAverage * 10) / 10,
      fpsMin: this.fpsMin === Infinity ? 0 : Math.round(this.fpsMin * 10) / 10,
      frameDropsOver25ms: this.frameDropsOver25ms,
      totalFrames: this.totalFrames,
      elapsedSec: Math.round(this.elapsedSec * 100) / 100,
      avgFrameDeltaMs: Math.round(avgFrameDeltaMs * 100) / 100,
      maxFrameDeltaMs: Math.round(this.maxFrameDeltaMs * 100) / 100,
      shotsFired: this.shotsFired,
      questionsResolved: resolved,
      correctAnswers: this.correctAnswers,
      wrongAnswers: this.wrongAnswers,
      successRatePct: Math.round(successRatePct * 10) / 10,
      supersTriggered: this.supersTriggered,
      gadgetsTriggered: this.gadgetsTriggered,
      jsErrorsCount: this.jsErrors.length,
      jsErrors: this.jsErrors.map((err) => ({ ...err })),
      memoryUsageMb: this.readMemorySnapshot(),
    };
  }

  public exportReportJson(pretty = true): string {
    return JSON.stringify(this.getReport(), null, pretty ? 2 : undefined);
  }

  public mountDebugMenuOverlay(container?: HTMLElement): IDebugOverlayHandle {
    if (typeof document === 'undefined') {
      throw new Error('mountDebugMenuOverlay nécessite un environnement DOM navigateur.');
    }

    this.debugOverlay?.unmount();

    const host = container ?? document.body;
    const root = document.createElement('aside');
    root.id = 'brawl-qa-debug-overlay';
    root.setAttribute('data-allow-multitouch', 'true');
    root.setAttribute('aria-label', 'Menu Debug Auto-Playtester QA');
    root.style.cssText = [
      'position:fixed',
      'top:max(10px,env(safe-area-inset-top))',
      'right:max(10px,env(safe-area-inset-right))',
      'z-index:9999',
      'width:270px',
      'background:rgba(2,6,23,0.92)',
      'border:1.5px solid rgba(250,204,21,0.75)',
      'border-radius:12px',
      'padding:10px 12px',
      'color:#f8fafc',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      'font-size:11px',
      'line-height:1.45',
      'box-shadow:0 12px 32px rgba(0,0,0,0.65)',
      'backdrop-filter:blur(8px)',
      'pointer-events:auto',
    ].join(';');

    let collapsed = false;

    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;">
        <strong style="color:#facc15;font-size:12px;letter-spacing:0.03em;">🤖 QA BOT 60 FPS</strong>
        <div style="display:flex;gap:4px;">
          <button type="button" data-qa-collapse="1" style="background:#1e293b;color:#cbd5e1;border:1px solid #475569;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:11px;">—</button>
          <button type="button" data-qa-close="1" style="background:#1e293b;color:#f87171;border:1px solid #475569;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:11px;">✕</button>
        </div>
      </div>
      <div data-qa-body="1">
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button type="button" data-qa-toggle="1" style="flex:1;padding:7px 8px;border-radius:8px;border:none;font-weight:700;cursor:pointer;background:#22c55e;color:#052e16;font-size:11px;">▶ Lancer (F9)</button>
          <button type="button" data-qa-export="1" style="padding:7px 8px;border-radius:8px;border:1px solid #38bdf8;background:#0f172a;color:#38bdf8;font-weight:700;cursor:pointer;font-size:11px;">📥 JSON</button>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;color:#cbd5e1;">
          <span>Précision Bot :</span>
          <div style="display:flex;gap:4px;">
            <button type="button" data-qa-acc="0.5" style="padding:2px 6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer;font-size:10px;">50%</button>
            <button type="button" data-qa-acc="0.85" style="padding:2px 6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer;font-size:10px;">85%</button>
            <button type="button" data-qa-acc="1" style="padding:2px 6px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;cursor:pointer;font-size:10px;">100%</button>
          </div>
        </div>
        <div data-qa-metrics="1" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:7px 8px;white-space:pre-wrap;color:#e2e8f0;"></div>
        <div data-qa-toast="1" style="margin-top:6px;color:#4ade80;min-height:14px;font-size:10px;"></div>
      </div>
    `;

    host.appendChild(root);

    const bodyEl = root.querySelector('[data-qa-body="1"]') as HTMLElement;
    const toggleBtn = root.querySelector('[data-qa-toggle="1"]') as HTMLButtonElement;
    const exportBtn = root.querySelector('[data-qa-export="1"]') as HTMLButtonElement;
    const collapseBtn = root.querySelector('[data-qa-collapse="1"]') as HTMLButtonElement;
    const closeBtn = root.querySelector('[data-qa-close="1"]') as HTMLButtonElement;
    const metricsEl = root.querySelector('[data-qa-metrics="1"]') as HTMLElement;
    const toastEl = root.querySelector('[data-qa-toast="1"]') as HTMLElement;
    const accButtons = Array.from(root.querySelectorAll('[data-qa-acc]')) as HTMLButtonElement[];

    const renderMetrics = (): void => {
      const r = this.getReport();
      toggleBtn.textContent = r.running ? '⏹ Stop (F9)' : '▶ Lancer (F9)';
      toggleBtn.style.background = r.running ? '#ef4444' : '#22c55e';
      toggleBtn.style.color = r.running ? '#ffffff' : '#052e16';

      for (const btn of accButtons) {
        const val = Number(btn.getAttribute('data-qa-acc'));
        const active = Math.abs(val - this.targetAccuracyRate) < 0.01;
        btn.style.borderColor = active ? '#facc15' : '#475569';
        btn.style.color = active ? '#facc15' : '#e2e8f0';
      }

      const memText = r.memoryUsageMb
        ? `${r.memoryUsageMb.usedJSHeapSizeMb.toFixed(1)} / ${r.memoryUsageMb.totalJSHeapSizeMb.toFixed(1)} MB`
        : 'N/A';

      metricsEl.textContent = [
        `État     : ${r.running ? 'ACTIF' : 'VEILLE'} (${r.adapterMode === 'ENGINE_ADAPTER' ? 'Arène' : 'Virtuel'})`,
        `FPS      : ${r.fpsCurrent.toFixed(1)} (moy ${r.fpsAverage.toFixed(1)} | min ${r.fpsMin.toFixed(1)})`,
        `Drops>25 : ${r.frameDropsOver25ms} / ${r.totalFrames} frames (${r.elapsedSec.toFixed(1)}s)`,
        `QCM      : ${r.correctAnswers}/${r.questionsResolved} (${r.successRatePct.toFixed(0)}%) | Tirs ${r.shotsFired}`,
        `Pouvoirs : Super ${r.supersTriggered} | Gadget ${r.gadgetsTriggered}`,
        `Erreurs  : ${r.jsErrorsCount} JS | Heap: ${memText}`,
      ].join('\n');
    };

    const onToggleClick = (ev: Event): void => {
      ev.stopPropagation();
      this.toggle();
      renderMetrics();
    };

    const onExportClick = (ev: Event): void => {
      ev.stopPropagation();
      const json = this.exportReportJson(true);
      this.triggerJsonDownload(json);
      toastEl.textContent = `Rapport QA exporté (${this.totalFrames} frames).`;
      window.setTimeout(() => {
        if (toastEl.isConnected) {
          toastEl.textContent = '';
        }
      }, 2500);
    };

    const onCollapseClick = (ev: Event): void => {
      ev.stopPropagation();
      collapsed = !collapsed;
      bodyEl.style.display = collapsed ? 'none' : 'block';
      collapseBtn.textContent = collapsed ? '+' : '—';
      root.style.width = collapsed ? 'auto' : '270px';
    };

    const accHandlers: Array<{ btn: HTMLButtonElement; handler: (ev: Event) => void }> = [];
    for (const btn of accButtons) {
      const handler = (ev: Event): void => {
        ev.stopPropagation();
        const rate = Number(btn.getAttribute('data-qa-acc'));
        if (!Number.isNaN(rate)) {
          this.setTargetAccuracy(rate);
          renderMetrics();
        }
      };
      btn.addEventListener('click', handler);
      accHandlers.push({ btn, handler });
    }

    let refreshTimerId: number | null = window.setInterval(renderMetrics, 150);

    const unmount = (): void => {
      if (refreshTimerId !== null) {
        window.clearInterval(refreshTimerId);
        refreshTimerId = null;
      }
      toggleBtn.removeEventListener('click', onToggleClick);
      exportBtn.removeEventListener('click', onExportClick);
      collapseBtn.removeEventListener('click', onCollapseClick);
      closeBtn.removeEventListener('click', onCloseClick);
      for (const item of accHandlers) {
        item.btn.removeEventListener('click', item.handler);
      }
      root.remove();
      if (this.debugOverlay === handle) {
        this.debugOverlay = null;
      }
    };

    const onCloseClick = (ev: Event): void => {
      ev.stopPropagation();
      unmount();
    };

    toggleBtn.addEventListener('click', onToggleClick);
    exportBtn.addEventListener('click', onExportClick);
    collapseBtn.addEventListener('click', onCollapseClick);
    closeBtn.addEventListener('click', onCloseClick);

    const handle: IDebugOverlayHandle = {
      element: root,
      refresh: renderMetrics,
      unmount,
    };

    this.debugOverlay = handle;
    renderMetrics();
    return handle;
  }

  public dispose(): void {
    this.stop();
    this.unbindKeyboardShortcut();
    this.detachErrorCapture();
    this.debugOverlay?.unmount();
    this.debugOverlay = null;
  }

  private getActiveAdapter(): IPlaytestTargetAdapter {
    return this.externalAdapter ?? this.fallbackAdapter;
  }

  private readonly tick = (): void => {
    if (!this.running) {
      return;
    }

    const now = performance.now();
    const dtMs = now - this.lastFramePerfMs;
    this.lastFramePerfMs = now;

    if (dtMs > 0) {
      this.totalFrames += 1;
      this.totalFrameDeltaMs += dtMs;
      this.elapsedSec = (now - this.startPerfMs) / 1000;
      if (dtMs > this.maxFrameDeltaMs) {
        this.maxFrameDeltaMs = dtMs;
      }

      const instantFps = Math.min(240, 1000 / dtMs);
      this.fpsCurrent = instantFps;
      if (this.totalFrames > 2 && instantFps < this.fpsMin) {
        this.fpsMin = instantFps;
      }
      if (dtMs > 25) {
        this.frameDropsOver25ms += 1;
      }
    }

    try {
      this.stepSimulation(now, Math.min(0.05, Math.max(0.001, dtMs / 1000)));
    } catch (error: unknown) {
      this.recordError('error', error instanceof Error ? error.message : String(error));
    }

    if (this.totalFrames % 10 === 0) {
      this.onReportUpdate?.(this.getReport());
    }

    if (this.running) {
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  };

  private stepSimulation(nowMs: number, dtSec: number): void {
    const adapter = this.getActiveAdapter();
    const player = adapter.getPlayerState();
    const targets = adapter.getActiveTargets();
    const obstacles = adapter.getObstacles?.() ?? [];
    const questionId = adapter.getCurrentQuestionId?.() ?? null;

    // Détection transition de question pour clôturer la question tirée si le moteur n'appelle pas notifyQuestionResolved
    if (
      !this.externalResolutionMode &&
      questionId !== null &&
      this.lastSeenQuestionId !== null &&
      questionId !== this.lastSeenQuestionId
    ) {
      if (this.pendingShotQuestionId === this.lastSeenQuestionId && this.pendingShotExpectedCorrect !== null) {
        this.questionsResolved += 1;
        if (this.pendingShotExpectedCorrect) {
          this.correctAnswers += 1;
        } else {
          this.wrongAnswers += 1;
        }
        this.pendingShotQuestionId = null;
        this.pendingShotExpectedCorrect = null;
      }
      this.currentTargetId = null;
    }
    this.lastSeenQuestionId = questionId;

    if (player.isAlive === false) {
      adapter.applyLeftStick({ x: 0, y: 0 });
      return;
    }

    // 1. Mouvement fluide du stick gauche : orbite tactique + évitement bords/obstacles
    const moveVector = this.computeTacticalMoveVector(player, obstacles, dtSec);
    adapter.applyLeftStick(moveVector);

    // 2. Super immédiat dès jauge pleine
    if (player.superGaugePct >= 100 && nowMs - this.lastSuperPerfMs >= 600) {
      this.lastSuperPerfMs = nowMs;
      adapter.triggerSuper();
      this.supersTriggered += 1;
    }

    // 3. Gadget périodique si charges disponibles
    if (
      player.gadgetCharges > 0 &&
      targets.length > 0 &&
      nowMs - this.lastGadgetPerfMs >= this.gadgetIntervalMs
    ) {
      this.lastGadgetPerfMs = nowMs;
      adapter.triggerGadget();
      this.gadgetsTriggered += 1;
    }

    // 4. Sélection cible QCM & visée stick droit
    const chosenTarget = this.selectTarget(targets);
    if (!chosenTarget) {
      return;
    }

    const aimAngle = Math.atan2(chosenTarget.y - player.y, chosenTarget.x - player.x);
    adapter.applyRightStickAim(aimAngle, { x: chosenTarget.x, y: chosenTarget.y });

    if (player.ammoBars >= 1 && nowMs - this.lastFirePerfMs >= this.fireIntervalMs) {
      this.lastFirePerfMs = nowMs;
      this.shotsFired += 1;
      adapter.triggerFire({
        angle: aimAngle,
        autoAim: false,
        targetWorldPos: { x: chosenTarget.x, y: chosenTarget.y },
      });

      if (!this.externalResolutionMode) {
        if (questionId !== null) {
          this.pendingShotQuestionId = questionId;
          this.pendingShotExpectedCorrect = chosenTarget.isCorrect;
        } else {
          this.questionsResolved += 1;
          if (chosenTarget.isCorrect) {
            this.correctAnswers += 1;
          } else {
            this.wrongAnswers += 1;
          }
        }
      }
    }
  }

  private computeTacticalMoveVector(
    player: IPlaytestPlayerState,
    obstacles: ReadonlyArray<IPlaytestObstacle>,
    dtSec: number
  ): IPlaytestVec2 {
    this.orbitAngle = (this.orbitAngle + dtSec * 0.95) % (Math.PI * 2);

    const centerX = player.arenaWidth * 0.5;
    const centerY = player.arenaHeight * 0.58;
    const orbitRadiusX = Math.max(80, player.arenaWidth * 0.24);
    const orbitRadiusY = Math.max(60, player.arenaHeight * 0.16);

    const waypointX = centerX + Math.cos(this.orbitAngle) * orbitRadiusX;
    const waypointY = centerY + Math.sin(this.orbitAngle) * orbitRadiusY;

    let steerX = waypointX - player.x;
    let steerY = waypointY - player.y;
    const steerLen = Math.hypot(steerX, steerY);
    if (steerLen > 1) {
      steerX /= steerLen;
      steerY /= steerLen;
    } else {
      steerX = 0;
      steerY = 0;
    }

    // Répulsion douce des bords d'arène
    const edgeMargin = 85;
    if (player.x < edgeMargin) {
      steerX += ((edgeMargin - player.x) / edgeMargin) * 1.8;
    } else if (player.x > player.arenaWidth - edgeMargin) {
      steerX -= ((player.x - (player.arenaWidth - edgeMargin)) / edgeMargin) * 1.8;
    }
    if (player.y < edgeMargin) {
      steerY += ((edgeMargin - player.y) / edgeMargin) * 1.8;
    } else if (player.y > player.arenaHeight - edgeMargin) {
      steerY -= ((player.y - (player.arenaHeight - edgeMargin)) / edgeMargin) * 1.8;
    }

    // Évitement des obstacles
    const avoidBuffer = 46;
    for (const obs of obstacles) {
      const closestX = Math.max(obs.x, Math.min(player.x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(player.y, obs.y + obs.height));
      const dx = player.x - closestX;
      const dy = player.y - closestY;
      const dist = Math.hypot(dx, dy);
      if (dist < avoidBuffer) {
        const push = (avoidBuffer - dist) / avoidBuffer;
        if (dist > 0.01) {
          steerX += (dx / dist) * push * 2.2;
          steerY += (dy / dist) * push * 2.2;
        } else {
          const obsCenterX = obs.x + obs.width * 0.5;
          const obsCenterY = obs.y + obs.height * 0.5;
          const outAngle = Math.atan2(player.y - obsCenterY, player.x - obsCenterX);
          steerX += Math.cos(outAngle) * 2.2;
          steerY += Math.sin(outAngle) * 2.2;
        }
      }
    }

    const totalLen = Math.hypot(steerX, steerY);
    const targetX = totalLen > 1 ? steerX / totalLen : steerX;
    const targetY = totalLen > 1 ? steerY / totalLen : steerY;

    const blend = Math.min(1, dtSec * 8);
    this.smoothedMove = {
      x: this.smoothedMove.x + (targetX - this.smoothedMove.x) * blend,
      y: this.smoothedMove.y + (targetY - this.smoothedMove.y) * blend,
    };

    return { ...this.smoothedMove };
  }

  private selectTarget(targets: ReadonlyArray<IPlaytestTarget>): IPlaytestTarget | null {
    if (targets.length === 0) {
      this.currentTargetId = null;
      return null;
    }

    if (this.currentTargetId !== null) {
      const existing = targets.find((t) => t.id === this.currentTargetId);
      if (existing) {
        return existing;
      }
    }

    const wantCorrect = Math.random() < this.targetAccuracyRate;
    const correctTargets = targets.filter((t) => t.isCorrect);
    const wrongTargets = targets.filter((t) => !t.isCorrect);

    let chosen: IPlaytestTarget | undefined;
    if (wantCorrect) {
      chosen = correctTargets[0] ?? wrongTargets[0];
    } else {
      const randomWrongIndex =
        wrongTargets.length > 0 ? Math.floor(Math.random() * wrongTargets.length) : 0;
      chosen = wrongTargets[randomWrongIndex] ?? correctTargets[0];
    }

    this.currentTargetId = chosen?.id ?? null;
    return chosen ?? null;
  }

  private readMemorySnapshot(): IPlaytestMemorySnapshot | null {
    if (typeof performance === 'undefined') {
      return null;
    }
    const perfWithMemory = performance as IPerformanceWithMemory;
    if (!perfWithMemory.memory) {
      return null;
    }
    const toMb = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 100) / 100;
    return {
      usedJSHeapSizeMb: toMb(perfWithMemory.memory.usedJSHeapSize),
      totalJSHeapSizeMb: toMb(perfWithMemory.memory.totalJSHeapSize),
      jsHeapSizeLimitMb: toMb(perfWithMemory.memory.jsHeapSizeLimit),
    };
  }

  private triggerJsonDownload(jsonContent: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return;
    }
    try {
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `brawl-college-qa-report-${stamp}.json`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Silencieux en environnement headless sans support Blob/download
    }
  }

  private clampRate(rate: number): number {
    if (Number.isNaN(rate)) {
      return 0.85;
    }
    return Math.max(0, Math.min(1, rate));
  }

  private bindKeyboardShortcut(): void {
    if (this.shortcutBound || typeof window === 'undefined') {
      return;
    }
    this.shortcutBound = true;
    window.addEventListener('keydown', this.onKeyDown);
  }

  private unbindKeyboardShortcut(): void {
    if (!this.shortcutBound || typeof window === 'undefined') {
      return;
    }
    this.shortcutBound = false;
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private attachErrorCapture(): void {
    if (this.errorListenersBound || typeof window === 'undefined') {
      return;
    }
    this.errorListenersBound = true;
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private detachErrorCapture(): void {
    if (!this.errorListenersBound || typeof window === 'undefined') {
      return;
    }
    this.errorListenersBound = false;
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private recordError(
    kind: 'error' | 'unhandledrejection',
    message: string,
    source?: string,
    line?: number,
    column?: number
  ): void {
    this.jsErrors.push({
      kind,
      message,
      source,
      line,
      column,
      timestampIso: new Date().toISOString(),
    });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === this.toggleKey || event.key === this.toggleKey) {
      event.preventDefault();
      this.toggle();
    }
  };

  private readonly onWindowError = (event: ErrorEvent): void => {
    this.recordError(
      'error',
      event.message || 'Unknown ErrorEvent',
      event.filename,
      event.lineno,
      event.colno
    );
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    this.recordError('unhandledrejection', message);
  };
}
