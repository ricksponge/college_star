/**
 * Gestionnaire PWA & Service Worker — Brawl Collège : Opération 6ème
 * - Enregistrement sécurisé de /sw.js (HTTPS / localhost)
 * - Détection et application des mises à jour (SKIP_WAITING)
 * - Suivi temps réel online/offline
 * - Capture du prompt d'installation Android/Chrome (beforeinstallprompt)
 * - Détection du mode standalone/fullscreen sur iPadOS, iOS et Android
 */

export type PwaDisplayMode = 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface IBeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface IServiceWorkerCacheStatus {
  type: 'CACHE_STATUS';
  cacheVersion: string;
  activeCaches: string[];
  entriesByCache: Record<string, number>;
  totalCachedEntries: number;
  precacheAssets: string[];
}

export interface IPwaPlatformInfo {
  isIOS: boolean;
  isIPadOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  displayMode: PwaDisplayMode;
  needsManualIOSInstallHint: boolean;
  serviceWorkerSupported: boolean;
  isSecureOrigin: boolean;
}

export interface IPwaStateSnapshot {
  isOnline: boolean;
  isRegistered: boolean;
  updateAvailable: boolean;
  canInstallPrompt: boolean;
  isInstalled: boolean;
  platform: IPwaPlatformInfo;
  registrationError: string | null;
}

export type PwaEventType =
  | 'statechange'
  | 'online'
  | 'offline'
  | 'registered'
  | 'updateavailable'
  | 'installpromptavailable'
  | 'appinstalled';

export type PwaStateListener = (snapshot: IPwaStateSnapshot, eventType: PwaEventType) => void;

export interface IServiceWorkerManagerOptions {
  swUrl?: string;
  scope?: string;
  autoReloadOnControllerChange?: boolean;
}

interface INavigatorStandalone extends Navigator {
  standalone?: boolean;
}

export class ServiceWorkerManager {
  private readonly swUrl: string;
  private readonly scope: string;
  private readonly autoReloadOnControllerChange: boolean;

  private registration: ServiceWorkerRegistration | null = null;
  private deferredInstallPrompt: IBeforeInstallPromptEvent | null = null;
  private updateAvailable = false;
  private isInstalled = false;
  private registrationError: string | null = null;
  private initialized = false;
  private pendingReloadOnControllerChange = false;

  private readonly listeners = new Set<PwaStateListener>();
  private readonly displayModeMediaQueries: MediaQueryList[] = [];
  private trackedInstallingWorker: ServiceWorker | null = null;

  constructor(options: IServiceWorkerManagerOptions = {}) {
    this.swUrl = options.swUrl ?? '/sw.js';
    this.scope = options.scope ?? '/';
    this.autoReloadOnControllerChange = options.autoReloadOnControllerChange ?? true;
  }

  public async init(): Promise<IPwaStateSnapshot> {
    if (typeof window === 'undefined') {
      return this.getSnapshot();
    }

    if (!this.initialized) {
      this.initialized = true;
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', this.handleAppInstalled);

      if (typeof window.matchMedia === 'function') {
        const standaloneQuery = window.matchMedia('(display-mode: standalone)');
        const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
        this.displayModeMediaQueries.push(standaloneQuery, fullscreenQuery);
        standaloneQuery.addEventListener('change', this.handleDisplayModeChange);
        fullscreenQuery.addEventListener('change', this.handleDisplayModeChange);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', this.handleControllerChange);
      }

      this.isInstalled = this.detectPlatformInfo().isStandalone;
    }

    await this.register();
    return this.getSnapshot();
  }

  public dispose(): void {
    if (typeof window === 'undefined' || !this.initialized) {
      return;
    }

    this.initialized = false;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.handleAppInstalled);

    for (const mq of this.displayModeMediaQueries) {
      mq.removeEventListener('change', this.handleDisplayModeChange);
    }
    this.displayModeMediaQueries.length = 0;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', this.handleControllerChange);
    }

    if (this.registration) {
      this.registration.removeEventListener('updatefound', this.handleUpdateFound);
    }
    if (this.trackedInstallingWorker) {
      this.trackedInstallingWorker.removeEventListener('statechange', this.handleInstallingStateChange);
      this.trackedInstallingWorker = null;
    }

    this.listeners.clear();
  }

  public async register(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      this.registrationError = 'Service Worker non supporté par ce navigateur.';
      this.emit('statechange');
      return null;
    }

    if (!this.isSecureOrigin()) {
      this.registrationError = 'Origine non sécurisée : HTTPS ou localhost requis pour le Service Worker.';
      this.emit('statechange');
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.register(this.swUrl, {
        scope: this.scope,
      });
      this.registration = reg;
      this.registrationError = null;

      reg.removeEventListener('updatefound', this.handleUpdateFound);
      reg.addEventListener('updatefound', this.handleUpdateFound);

      if (reg.waiting && navigator.serviceWorker.controller) {
        this.updateAvailable = true;
        this.emit('updateavailable');
      } else {
        this.emit('registered');
      }

      return reg;
    } catch (error: unknown) {
      this.registrationError =
        error instanceof Error ? error.message : 'Erreur inconnue lors de l’enregistrement du Service Worker.';
      this.emit('statechange');
      return null;
    }
  }

  public async checkForUpdate(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }
    try {
      await this.registration.update();
      return Boolean(this.registration.waiting || this.updateAvailable);
    } catch {
      return false;
    }
  }

  public async applyUpdate(): Promise<boolean> {
    const waitingWorker = this.registration?.waiting;
    if (!waitingWorker) {
      return false;
    }

    this.pendingReloadOnControllerChange = this.autoReloadOnControllerChange;

    return new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        resolve(true);
      }, 1500);

      channel.port1.onmessage = () => {
        window.clearTimeout(timeout);
        resolve(true);
      };

      try {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' }, [channel.port2]);
      } catch {
        window.clearTimeout(timeout);
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        resolve(true);
      }
    });
  }

  public async getCacheStatus(timeoutMs = 2500): Promise<IServiceWorkerCacheStatus | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    const targetWorker =
      navigator.serviceWorker.controller ??
      this.registration?.active ??
      this.registration?.waiting ??
      null;

    if (!targetWorker) {
      return null;
    }

    return new Promise<IServiceWorkerCacheStatus | null>((resolve) => {
      const channel = new MessageChannel();
      const timer = window.setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        window.clearTimeout(timer);
        const data = event.data as Partial<IServiceWorkerCacheStatus> | null;
        if (data && data.type === 'CACHE_STATUS' && typeof data.cacheVersion === 'string') {
          resolve(data as IServiceWorkerCacheStatus);
        } else {
          resolve(null);
        }
      };

      try {
        targetWorker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
      } catch {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  }

  public canPromptInstall(): boolean {
    return this.deferredInstallPrompt !== null;
  }

  public async promptInstall(): Promise<InstallPromptOutcome> {
    if (!this.deferredInstallPrompt) {
      return 'unavailable';
    }

    const promptEvent = this.deferredInstallPrompt;
    this.deferredInstallPrompt = null;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        this.isInstalled = true;
      }
      this.emit('statechange');
      return choice.outcome;
    } catch {
      this.emit('statechange');
      return 'dismissed';
    }
  }

  public isOnline(): boolean {
    if (typeof navigator === 'undefined') {
      return true;
    }
    return navigator.onLine;
  }

  public getPlatformInfo(): IPwaPlatformInfo {
    return this.detectPlatformInfo();
  }

  public getSnapshot(): IPwaStateSnapshot {
    const platform = this.detectPlatformInfo();
    return {
      isOnline: this.isOnline(),
      isRegistered: this.registration !== null,
      updateAvailable: this.updateAvailable,
      canInstallPrompt: this.canPromptInstall(),
      isInstalled: this.isInstalled || platform.isStandalone,
      platform,
      registrationError: this.registrationError,
    };
  }

  public subscribe(listener: PwaStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private detectPlatformInfo(): IPwaPlatformInfo {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        isIOS: false,
        isIPadOS: false,
        isAndroid: false,
        isStandalone: false,
        displayMode: 'browser',
        needsManualIOSInstallHint: false,
        serviceWorkerSupported: false,
        isSecureOrigin: false,
      };
    }

    const ua = navigator.userAgent || '';
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const isIPadUA = /iPad/i.test(ua);
    const isIPadOSDesktopUA = navigator.platform === 'MacIntel' && maxTouchPoints > 1;
    const isIPadOS = isIPadUA || isIPadOSDesktopUA;
    const isIOS = isIPadOS || /iPhone|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    const displayMode = this.detectDisplayMode();
    const iosNavigatorStandalone = (navigator as INavigatorStandalone).standalone === true;
    const androidReferrerStandalone =
      typeof document !== 'undefined' && document.referrer.startsWith('android-app://');

    const isStandalone =
      iosNavigatorStandalone ||
      androidReferrerStandalone ||
      displayMode === 'standalone' ||
      displayMode === 'fullscreen';

    return {
      isIOS,
      isIPadOS,
      isAndroid,
      isStandalone,
      displayMode,
      needsManualIOSInstallHint: isIOS && !isStandalone,
      serviceWorkerSupported: 'serviceWorker' in navigator,
      isSecureOrigin: this.isSecureOrigin(),
    };
  }

  private detectDisplayMode(): PwaDisplayMode {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'browser';
    }
    if (window.matchMedia('(display-mode: fullscreen)').matches) {
      return 'fullscreen';
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return 'standalone';
    }
    if (window.matchMedia('(display-mode: minimal-ui)').matches) {
      return 'minimal-ui';
    }
    return 'browser';
  }

  private isSecureOrigin(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    if (window.isSecureContext) {
      return true;
    }
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  private emit(eventType: PwaEventType): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot, eventType);
    }
  }

  private readonly handleOnline = (): void => {
    this.emit('online');
  };

  private readonly handleOffline = (): void => {
    this.emit('offline');
  };

  private readonly handleBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredInstallPrompt = event as IBeforeInstallPromptEvent;
    this.emit('installpromptavailable');
  };

  private readonly handleAppInstalled = (): void => {
    this.deferredInstallPrompt = null;
    this.isInstalled = true;
    this.emit('appinstalled');
  };

  private readonly handleDisplayModeChange = (): void => {
    if (this.detectPlatformInfo().isStandalone) {
      this.isInstalled = true;
    }
    this.emit('statechange');
  };

  private readonly handleControllerChange = (): void => {
    this.updateAvailable = false;
    this.emit('statechange');
    if (this.pendingReloadOnControllerChange && typeof window !== 'undefined') {
      this.pendingReloadOnControllerChange = false;
      window.location.reload();
    }
  };

  private readonly handleUpdateFound = (): void => {
    if (!this.registration) {
      return;
    }
    const installing = this.registration.installing;
    if (!installing) {
      return;
    }

    if (this.trackedInstallingWorker) {
      this.trackedInstallingWorker.removeEventListener('statechange', this.handleInstallingStateChange);
    }
    this.trackedInstallingWorker = installing;
    installing.addEventListener('statechange', this.handleInstallingStateChange);
  };

  private readonly handleInstallingStateChange = (): void => {
    if (!this.trackedInstallingWorker) {
      return;
    }
    if (
      this.trackedInstallingWorker.state === 'installed' &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller
    ) {
      this.updateAvailable = true;
      this.emit('updateavailable');
    }
  };
}
