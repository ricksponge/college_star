/**
 * Verrouillage tactile matériel tablette (iPadOS Safari & Android Chrome)
 * — Brawl Collège : Opération 6ème
 *
 * COMMENT LE DOUBLE-STICK MULTI-TOUCH RESTE INTACT ALORS QUE LE ZOOM NAVIGATEUR EST BLOQUÉ :
 * 1. `TwinStickController` et les boutons HUD (`Super`, `Gadget`, `Indice`) écoutent les
 *    `PointerEvents` (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) indexés par
 *    `pointerId` distinct (pouce gauche + pouce droit + boutons d'action, jusqu'à 4 doigts).
 * 2. Sur iPadOS/iOS Safari, `e.preventDefault()` sur `gesturestart` / `gesturechange` / `gestureend`
 *    annule uniquement le reconnaisseur natif de pincement/rotation du viewport WebKit SANS
 *    interrompre l'envoi des `PointerEvents` individuels de chaque doigt sur le canvas.
 * 3. Sur `touchend`, l'interception du double-tap (< 300 ms entre deux appuis simples) via
 *    `e.preventDefault()` bloque le zoom double-tap navigateur après le traitement déjà effectué
 *    sur `pointerdown` / `pointerup`.
 * 4. La combinaison `touch-action: none` + `overscroll-behavior: none` sur la zone de jeu
 *    supprime nativement le pull-to-refresh et le pincement sur Android Chrome tout en autorisant
 *    jusqu'à 4 doigts simultanés sur `.arena-container`, joysticks et `[data-allow-multitouch="true"]`.
 */

export interface ITouchLockOptions {
  /** Élément racine à verrouiller (défaut : document.documentElement) */
  target?: HTMLElement | null;
  /** Bloque le pinch-to-zoom multi-doigts hors des contrôles de jeu (défaut : true) */
  preventPinchOutsideControls?: boolean;
  /** Nombre max de doigts simultanés autorisés en zone multi-touch (défaut : 4) */
  maxMultiTouchPointers?: number;
  /** Fenêtre temporelle du double-tap zoom en ms (défaut : 300) */
  doubleTapThresholdMs?: number;
  /** Sélecteurs CSS des zones autorisant le multi-touch jeu (défaut : arène, joysticks, actions) */
  multiTouchSelectors?: string[];
  /** État initial ou prédicat dynamique du mode jeu plein écran */
  gameModeActive?: boolean;
  isGameModeActive?: () => boolean;
  /** Bloque le menu contextuel / appui long (défaut : true) */
  disableContextMenu?: boolean;
  /** Bloque la sélection de texte hors champs de saisie (défaut : true) */
  disableSelection?: boolean;
  /** Bloque le pull-to-refresh et le rebond élastique (défaut : true) */
  disablePullToRefresh?: boolean;
}

export interface ITouchLockMetrics {
  isAttached: boolean;
  gameModeActive: boolean;
  activePointers: number;
  peakSimultaneousPointers: number;
  activeTouches: number;
  peakSimultaneousTouches: number;
  allowedMultiTouchEvents: number;
  blockedPinchEvents: number;
  blockedDoubleTapEvents: number;
  blockedContextMenus: number;
  blockedPullToRefreshEvents: number;
  maxMultiTouchPointers: number;
}

interface IElementWithPrefixedFullscreen extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

interface IDocumentWithPrefixedFullscreen extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface IScreenOrientationWithLock extends ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}

interface ISavedStyleSnapshot {
  overscrollBehavior: string;
  touchAction: string;
  userSelect: string;
  webkitUserSelect: string;
  webkitTouchCallout: string;
  webkitUserDrag: string;
}

const DEFAULT_MULTITOUCH_SELECTORS = [
  '.arena-container',
  '[data-allow-multitouch="true"]',
  '.joystick-zone',
  '.brawl-action-btn',
];

export class TouchLock {
  private readonly explicitTarget: HTMLElement | null;
  private readonly preventPinchOutsideControls: boolean;
  private readonly maxMultiTouchPointers: number;
  private readonly doubleTapThresholdMs: number;
  private readonly multiTouchSelectors: string[];
  private readonly isGameModeActiveFn?: () => boolean;
  private readonly disableContextMenu: boolean;
  private readonly disableSelection: boolean;
  private readonly disablePullToRefresh: boolean;

  private gameModeActive: boolean;
  private attached = false;
  private attachedTarget: HTMLElement | null = null;

  private readonly activePointerIds = new Set<number>();
  private peakSimultaneousPointers = 0;
  private activeTouches = 0;
  private peakSimultaneousTouches = 0;
  private allowedMultiTouchEvents = 0;
  private blockedPinchEvents = 0;
  private blockedDoubleTapEvents = 0;
  private blockedContextMenus = 0;
  private blockedPullToRefreshEvents = 0;

  private lastTouchEndMs = 0;
  private lastTouchEndPos: { x: number; y: number } | null = null;
  private touchStartY = 0;

  private targetSavedStyles: ISavedStyleSnapshot | null = null;
  private htmlSavedStyles: ISavedStyleSnapshot | null = null;
  private bodySavedStyles: ISavedStyleSnapshot | null = null;

  constructor(options: ITouchLockOptions = {}) {
    this.explicitTarget = options.target ?? null;
    this.preventPinchOutsideControls = options.preventPinchOutsideControls ?? true;
    this.maxMultiTouchPointers = Math.max(2, Math.min(8, options.maxMultiTouchPointers ?? 4));
    this.doubleTapThresholdMs = options.doubleTapThresholdMs ?? 300;
    this.multiTouchSelectors = options.multiTouchSelectors ?? [...DEFAULT_MULTITOUCH_SELECTORS];
    this.gameModeActive = options.gameModeActive ?? false;
    this.isGameModeActiveFn = options.isGameModeActive;
    this.disableContextMenu = options.disableContextMenu ?? true;
    this.disableSelection = options.disableSelection ?? true;
    this.disablePullToRefresh = options.disablePullToRefresh ?? true;
  }

  public attach(overrideTarget?: HTMLElement): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (this.attached) {
      if (overrideTarget && overrideTarget !== this.attachedTarget) {
        this.detach();
      } else {
        return;
      }
    }

    const target = overrideTarget ?? this.explicitTarget ?? document.documentElement;
    this.attachedTarget = target;
    this.attached = true;

    this.applyLockStyles(target);

    const nonPassive: AddEventListenerOptions = { passive: false, capture: true };
    const passiveCapture: AddEventListenerOptions = { passive: true, capture: true };

    document.addEventListener('gesturestart', this.onGestureEvent, nonPassive);
    document.addEventListener('gesturechange', this.onGestureEvent, nonPassive);
    document.addEventListener('gestureend', this.onGestureEvent, nonPassive);

    document.addEventListener('touchstart', this.onTouchStart, passiveCapture);
    document.addEventListener('touchmove', this.onTouchMove, nonPassive);
    document.addEventListener('touchend', this.onTouchEnd, nonPassive);
    document.addEventListener('touchcancel', this.onTouchCancel, passiveCapture);

    window.addEventListener('pointerdown', this.onPointerDown, passiveCapture);
    window.addEventListener('pointerup', this.onPointerUpOrCancel, passiveCapture);
    window.addEventListener('pointercancel', this.onPointerUpOrCancel, passiveCapture);

    if (this.disableContextMenu) {
      document.addEventListener('contextmenu', this.onContextMenu, nonPassive);
    }
    if (this.disableSelection) {
      document.addEventListener('selectstart', this.onSelectStart, nonPassive);
    }
    document.addEventListener('dragstart', this.onDragStart, nonPassive);
  }

  public detach(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !this.attached) {
      return;
    }

    this.attached = false;

    const captureTrue: AddEventListenerOptions = { capture: true };

    document.removeEventListener('gesturestart', this.onGestureEvent, captureTrue);
    document.removeEventListener('gesturechange', this.onGestureEvent, captureTrue);
    document.removeEventListener('gestureend', this.onGestureEvent, captureTrue);

    document.removeEventListener('touchstart', this.onTouchStart, captureTrue);
    document.removeEventListener('touchmove', this.onTouchMove, captureTrue);
    document.removeEventListener('touchend', this.onTouchEnd, captureTrue);
    document.removeEventListener('touchcancel', this.onTouchCancel, captureTrue);

    window.removeEventListener('pointerdown', this.onPointerDown, captureTrue);
    window.removeEventListener('pointerup', this.onPointerUpOrCancel, captureTrue);
    window.removeEventListener('pointercancel', this.onPointerUpOrCancel, captureTrue);

    document.removeEventListener('contextmenu', this.onContextMenu, captureTrue);
    document.removeEventListener('selectstart', this.onSelectStart, captureTrue);
    document.removeEventListener('dragstart', this.onDragStart, captureTrue);

    this.restoreLockStyles();

    this.activePointerIds.clear();
    this.activeTouches = 0;
    this.attachedTarget = null;
  }

  public setGameMode(active: boolean): void {
    this.gameModeActive = active;
  }

  public isAttached(): boolean {
    return this.attached;
  }

  public resetMetrics(): void {
    this.peakSimultaneousPointers = this.activePointerIds.size;
    this.peakSimultaneousTouches = this.activeTouches;
    this.allowedMultiTouchEvents = 0;
    this.blockedPinchEvents = 0;
    this.blockedDoubleTapEvents = 0;
    this.blockedContextMenus = 0;
    this.blockedPullToRefreshEvents = 0;
  }

  public getMultiTouchMetrics(): ITouchLockMetrics {
    return {
      isAttached: this.attached,
      gameModeActive: this.isInGameMode(),
      activePointers: this.activePointerIds.size,
      peakSimultaneousPointers: this.peakSimultaneousPointers,
      activeTouches: this.activeTouches,
      peakSimultaneousTouches: this.peakSimultaneousTouches,
      allowedMultiTouchEvents: this.allowedMultiTouchEvents,
      blockedPinchEvents: this.blockedPinchEvents,
      blockedDoubleTapEvents: this.blockedDoubleTapEvents,
      blockedContextMenus: this.blockedContextMenus,
      blockedPullToRefreshEvents: this.blockedPullToRefreshEvents,
      maxMultiTouchPointers: this.maxMultiTouchPointers,
    };
  }

  public async requestTabletFullscreen(element?: HTMLElement): Promise<boolean> {
    if (typeof document === 'undefined') {
      return false;
    }

    const doc = document as IDocumentWithPrefixedFullscreen;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      return true;
    }

    const target = (element ?? this.attachedTarget ?? document.documentElement) as IElementWithPrefixedFullscreen;
    if (!target) {
      return false;
    }

    try {
      if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen();
        return true;
      }
      if (typeof target.webkitRequestFullscreen === 'function') {
        await Promise.resolve(target.webkitRequestFullscreen());
        return true;
      }
      if (typeof target.msRequestFullscreen === 'function') {
        await Promise.resolve(target.msRequestFullscreen());
        return true;
      }
      return false;
    } catch {
      // iOS Safari (iPhone) ou appel hors geste utilisateur : échec silencieux maîtrisé
      return false;
    }
  }

  public async exitTabletFullscreen(): Promise<boolean> {
    if (typeof document === 'undefined') {
      return false;
    }

    const doc = document as IDocumentWithPrefixedFullscreen;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      return true;
    }

    try {
      if (typeof doc.exitFullscreen === 'function') {
        await doc.exitFullscreen();
        return true;
      }
      if (typeof doc.webkitExitFullscreen === 'function') {
        await Promise.resolve(doc.webkitExitFullscreen());
        return true;
      }
      if (typeof doc.msExitFullscreen === 'function') {
        await Promise.resolve(doc.msExitFullscreen());
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async lockLandscapeOrientation(): Promise<boolean> {
    if (typeof screen === 'undefined' || !screen.orientation) {
      return false;
    }

    const orientation = screen.orientation as IScreenOrientationWithLock;
    if (typeof orientation.lock !== 'function') {
      return false;
    }

    try {
      await orientation.lock('landscape');
      return true;
    } catch {
      // iOS Safari ne supporte pas ScreenOrientation.lock() et rejette ou reste indéfini
      return false;
    }
  }

  private isInGameMode(): boolean {
    if (this.isGameModeActiveFn) {
      return this.isGameModeActiveFn();
    }
    return this.gameModeActive;
  }

  private isAllowedMultiTouchZone(target: EventTarget | null): boolean {
    if (this.isInGameMode()) {
      return true;
    }
    if (!(target instanceof Element)) {
      return false;
    }
    for (const selector of this.multiTouchSelectors) {
      if (target.matches(selector) || target.closest(selector) !== null) {
        return true;
      }
    }
    return false;
  }

  private isEditableInput(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    return (target as HTMLElement).isContentEditable === true;
  }

  private isInsideScrollableContainer(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    let current: Element | null = target;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
        if (current.scrollTop > 0) {
          return true;
        }
      }
      current = current.parentElement;
    }
    return false;
  }

  private snapshotStyles(el: HTMLElement): ISavedStyleSnapshot {
    const style = el.style;
    return {
      overscrollBehavior: style.overscrollBehavior,
      touchAction: style.touchAction,
      userSelect: style.userSelect,
      webkitUserSelect: style.getPropertyValue('-webkit-user-select'),
      webkitTouchCallout: style.getPropertyValue('-webkit-touch-callout'),
      webkitUserDrag: style.getPropertyValue('-webkit-user-drag'),
    };
  }

  private restoreElementStyles(el: HTMLElement | null, snapshot: ISavedStyleSnapshot | null): void {
    if (!el || !snapshot) {
      return;
    }
    el.style.overscrollBehavior = snapshot.overscrollBehavior;
    el.style.touchAction = snapshot.touchAction;
    el.style.userSelect = snapshot.userSelect;
    el.style.setProperty('-webkit-user-select', snapshot.webkitUserSelect);
    el.style.setProperty('-webkit-touch-callout', snapshot.webkitTouchCallout);
    el.style.setProperty('-webkit-user-drag', snapshot.webkitUserDrag);
  }

  private applyLockStyles(target: HTMLElement): void {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;

    if (htmlEl) {
      this.htmlSavedStyles = this.snapshotStyles(htmlEl);
      if (this.disablePullToRefresh) {
        htmlEl.style.overscrollBehavior = 'none';
      }
      if (this.disableSelection) {
        htmlEl.style.userSelect = 'none';
        htmlEl.style.setProperty('-webkit-user-select', 'none');
      }
      htmlEl.style.setProperty('-webkit-touch-callout', 'none');
    }

    if (bodyEl) {
      this.bodySavedStyles = this.snapshotStyles(bodyEl);
      if (this.disablePullToRefresh) {
        bodyEl.style.overscrollBehavior = 'none';
      }
      if (this.disableSelection) {
        bodyEl.style.userSelect = 'none';
        bodyEl.style.setProperty('-webkit-user-select', 'none');
      }
      bodyEl.style.setProperty('-webkit-touch-callout', 'none');
      bodyEl.style.setProperty('-webkit-user-drag', 'none');
    }

    this.targetSavedStyles = this.snapshotStyles(target);
    if (this.disablePullToRefresh) {
      target.style.overscrollBehavior = 'none';
    }
    // Bloque les gestes navigateur (zoom/pan) sur la cible de jeu tout en préservant les PointerEvents multi-doigts
    target.style.touchAction = 'none';
    if (this.disableSelection) {
      target.style.userSelect = 'none';
      target.style.setProperty('-webkit-user-select', 'none');
    }
    target.style.setProperty('-webkit-touch-callout', 'none');
    target.style.setProperty('-webkit-user-drag', 'none');
  }

  private restoreLockStyles(): void {
    this.restoreElementStyles(this.attachedTarget, this.targetSavedStyles);
    this.restoreElementStyles(document.documentElement, this.htmlSavedStyles);
    this.restoreElementStyles(document.body, this.bodySavedStyles);
    this.targetSavedStyles = null;
    this.htmlSavedStyles = null;
    this.bodySavedStyles = null;
  }

  private readonly onGestureEvent = (event: Event): void => {
    event.preventDefault();
    this.blockedPinchEvents += 1;
  };

  private readonly onTouchStart = (event: TouchEvent): void => {
    this.activeTouches = event.touches.length;
    if (this.activeTouches > this.peakSimultaneousTouches) {
      this.peakSimultaneousTouches = this.activeTouches;
    }
    if (event.touches.length === 1) {
      this.touchStartY = event.touches[0].clientY;
    }
    if (event.touches.length > 1 && this.isAllowedMultiTouchZone(event.target)) {
      this.allowedMultiTouchEvents += 1;
    }
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    this.activeTouches = event.touches.length;
    if (this.activeTouches > this.peakSimultaneousTouches) {
      this.peakSimultaneousTouches = this.activeTouches;
    }

    if (event.touches.length > 1) {
      const allowedZone = this.isAllowedMultiTouchZone(event.target);
      if (allowedZone && event.touches.length <= this.maxMultiTouchPointers) {
        this.allowedMultiTouchEvents += 1;
        return;
      }

      if (this.preventPinchOutsideControls || event.touches.length > this.maxMultiTouchPointers) {
        event.preventDefault();
        this.blockedPinchEvents += 1;
        return;
      }
    }

    if (
      this.disablePullToRefresh &&
      event.touches.length === 1 &&
      window.scrollY <= 0 &&
      !this.isInsideScrollableContainer(event.target)
    ) {
      const currentY = event.touches[0].clientY;
      const pullingDown = currentY - this.touchStartY > 4;
      if (pullingDown || this.isAllowedMultiTouchZone(event.target)) {
        event.preventDefault();
        if (pullingDown) {
          this.blockedPullToRefreshEvents += 1;
        }
      }
    }
  };

  private readonly onTouchEnd = (event: TouchEvent): void => {
    this.activeTouches = event.touches.length;

    // Uniquement sur levée du dernier doigt (séquence tap simple) pour ne pas bloquer le relâchement d'un stick
    if (event.touches.length === 0 && event.changedTouches.length === 1) {
      const now = performance.now();
      const touch = event.changedTouches[0];
      const deltaMs = now - this.lastTouchEndMs;

      const isCloseTap =
        this.lastTouchEndPos === null ||
        Math.hypot(touch.clientX - this.lastTouchEndPos.x, touch.clientY - this.lastTouchEndPos.y) <= 48;

      if (
        deltaMs > 0 &&
        deltaMs < this.doubleTapThresholdMs &&
        isCloseTap &&
        !this.isEditableInput(event.target)
      ) {
        event.preventDefault();
        this.blockedDoubleTapEvents += 1;
      }

      this.lastTouchEndMs = now;
      this.lastTouchEndPos = { x: touch.clientX, y: touch.clientY };
    }
  };

  private readonly onTouchCancel = (event: TouchEvent): void => {
    this.activeTouches = event.touches.length;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.activePointerIds.add(event.pointerId);
      if (this.activePointerIds.size > this.peakSimultaneousPointers) {
        this.peakSimultaneousPointers = this.activePointerIds.size;
      }
    }
  };

  private readonly onPointerUpOrCancel = (event: PointerEvent): void => {
    this.activePointerIds.delete(event.pointerId);
  };

  private readonly onContextMenu = (event: Event): void => {
    if (this.isEditableInput(event.target)) {
      return;
    }
    event.preventDefault();
    this.blockedContextMenus += 1;
  };

  private readonly onSelectStart = (event: Event): void => {
    if (this.isEditableInput(event.target)) {
      return;
    }
    event.preventDefault();
  };

  private readonly onDragStart = (event: Event): void => {
    event.preventDefault();
  };
}
