import {
  CleanerBackend,
  MediaItem,
  FolderItem,
  PendingAction,
  CleanerStats,
  ApplyPendingSummary,
  AnalysisStatus,
  DuplicateGroup,
  ActionType,
} from '../contracts';

declare global {
  interface Window {
    AndroidBridge?: {
      listPage(offset: number, limit: number, sortOrder: string, filtersJson: string): string;
      getFolders(): string;
      createFolder(name: string, emoji: string, color: string): string;
      setFavoriteFolder(folderId: string): string;
      queueAction(id: string, action: string, targetFolderId: string): string;
      undo(): string;
      getPendingActions(): string;
      getStats(): string;
      applyPending(mode: string, batchSize: number): string;
      trashList(): string;
      restore(idsJson: string): string;
      emptyTrash(): string;
      startAnalysis(): string;
      getAnalysisStatus(): string;
      getDuplicateGroups(): string;
      getBlurry(threshold: number): string;
      getDark(threshold: number): string;
      getScreenshots(): string;
      vibrate(milliseconds: number): void;
      playFeedbackSound(soundType: string): void;
    };
    onNative?: (event: string, payload: any) => void;
  }
}

/**
 * Implementación de CleanerBackend para WebView de Android.
 * Se comunica con la clase MediaBridge.kt vía @JavascriptInterface.
 */
export class AndroidBridgeBackend implements CleanerBackend {
  private nativeListeners: ((event: string, payload: any) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const prevOnNative = window.onNative;
      window.onNative = (event: string, payload: any) => {
        if (prevOnNative) prevOnNative(event, payload);
        this.nativeListeners.forEach((fn) => fn(event, payload));
      };
    }
  }

  getPlatform(): 'android' {
    return 'android';
  }

  async init(): Promise<boolean> {
    return typeof window !== 'undefined' && Boolean(window.AndroidBridge);
  }

  onNativeEvent(listener: (event: string, payload: any) => void) {
    this.nativeListeners.push(listener);
    return () => {
      this.nativeListeners = this.nativeListeners.filter((l) => l !== listener);
    };
  }

  async listPage(
    offset: number,
    limit: number,
    sortOrder: 'date_desc' | 'date_asc' | 'size_desc' | 'random' | 'album' = 'date_desc',
    filters?: { album?: string; onlyScreenshots?: boolean; dateRange?: [number, number] }
  ): Promise<MediaItem[]> {
    if (!window.AndroidBridge) return [];
    try {
      const json = window.AndroidBridge.listPage(
        offset,
        limit,
        sortOrder,
        JSON.stringify(filters || {})
      );
      return JSON.parse(json);
    } catch (e) {
      console.error('Error listPage en AndroidBridge:', e);
      return [];
    }
  }

  thumbUrl(id: string, size = 300): string {
    // Ruta virtual interceptada por WebViewAssetLoader en Android
    return `https://appassets.androidplatform.net/media/${id}?s=thumb&size=${size}`;
  }

  fullUrl(id: string): string {
    return `https://appassets.androidplatform.net/media/${id}?s=full`;
  }

  async getFolders(): Promise<FolderItem[]> {
    if (!window.AndroidBridge) return [];
    try {
      const json = window.AndroidBridge.getFolders();
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  async createFolder(name: string, emoji: string, color: string): Promise<FolderItem> {
    if (!window.AndroidBridge) {
      throw new Error('AndroidBridge no disponible');
    }
    const json = window.AndroidBridge.createFolder(name, emoji, color);
    return JSON.parse(json);
  }

  async setFavoriteFolder(folderId: string): Promise<void> {
    if (window.AndroidBridge) {
      window.AndroidBridge.setFavoriteFolder(folderId);
    }
  }

  async queueAction(id: string, action: ActionType, targetFolderId = ''): Promise<boolean> {
    if (!window.AndroidBridge) return false;
    const res = window.AndroidBridge.queueAction(id, action, targetFolderId);
    return res === 'true' || res === '1';
  }

  async undo(): Promise<PendingAction | null> {
    if (!window.AndroidBridge) return null;
    const json = window.AndroidBridge.undo();
    if (!json || json === 'null') return null;
    return JSON.parse(json);
  }

  async getPendingActions(): Promise<PendingAction[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.getPendingActions();
    return JSON.parse(json || '[]');
  }

  async getStats(): Promise<CleanerStats> {
    if (!window.AndroidBridge) {
      return {
        reviewedCount: 0,
        trashedCount: 0,
        movedCount: 0,
        skippedCount: 0,
        favoritesCount: 0,
        bytesFreed: 0,
        totalGalleryCount: 0,
      };
    }
    const json = window.AndroidBridge.getStats();
    return JSON.parse(json);
  }

  async applyPending(
    mode: 'simulation' | 'real',
    batchSize = 100
  ): Promise<{ success: boolean; appliedCount: number; summary: ApplyPendingSummary }> {
    if (!window.AndroidBridge) {
      throw new Error('AndroidBridge no disponible');
    }
    const json = window.AndroidBridge.applyPending(mode, batchSize);
    return JSON.parse(json);
  }

  async trashList(): Promise<MediaItem[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.trashList();
    return JSON.parse(json || '[]');
  }

  async restore(ids: string[]): Promise<boolean> {
    if (!window.AndroidBridge) return false;
    const res = window.AndroidBridge.restore(JSON.stringify(ids));
    return res === 'true';
  }

  async emptyTrash(): Promise<boolean> {
    if (!window.AndroidBridge) return false;
    const res = window.AndroidBridge.emptyTrash();
    return res === 'true';
  }

  async startAnalysis(): Promise<void> {
    if (window.AndroidBridge) {
      window.AndroidBridge.startAnalysis();
    }
  }

  async getAnalysisStatus(): Promise<AnalysisStatus> {
    if (!window.AndroidBridge) {
      return {
        isAnalyzing: false,
        analyzedCount: 0,
        totalCount: 0,
        progressPercent: 0,
        duplicateGroupsCount: 0,
        blurryCount: 0,
        darkCount: 0,
        screenshotsCount: 0,
      };
    }
    const json = window.AndroidBridge.getAnalysisStatus();
    return JSON.parse(json);
  }

  async getDuplicateGroups(): Promise<DuplicateGroup[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.getDuplicateGroups();
    return JSON.parse(json || '[]');
  }

  async getBlurry(threshold = 100): Promise<MediaItem[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.getBlurry(threshold);
    return JSON.parse(json || '[]');
  }

  async getDark(threshold = 28): Promise<MediaItem[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.getDark(threshold);
    return JSON.parse(json || '[]');
  }

  async getScreenshots(): Promise<MediaItem[]> {
    if (!window.AndroidBridge) return [];
    const json = window.AndroidBridge.getScreenshots();
    return JSON.parse(json || '[]');
  }

  vibrate(ms = 35): void {
    if (window.AndroidBridge?.vibrate) {
      window.AndroidBridge.vibrate(ms);
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  playSound(type: 'trash' | 'move' | 'skip' | 'pop'): void {
    if (window.AndroidBridge?.playFeedbackSound) {
      window.AndroidBridge.playFeedbackSound(type);
    }
  }
}
