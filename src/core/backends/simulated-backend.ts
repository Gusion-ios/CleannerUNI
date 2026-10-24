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
import { clusterSimilarImages } from '../algorithms';

// Generador determinista de 26.000 fotos simuladas
function generateSimulatedGallery(total = 26000): MediaItem[] {
  const albums = ['Camera', 'Screenshots', 'WhatsApp', 'Memes', 'Descargas', 'Familia', 'Viajes'];
  const items: MediaItem[] = [];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 1; i <= total; i++) {
    const albumIndex = i % albums.length;
    const album = albums[albumIndex];
    const isScreenshot = album === 'Screenshots' || (i % 37 === 0);
    const isBlurry = i % 43 === 0;
    const isDark = i % 89 === 0;
    const isNearDuplicate = i % 19 === 0;

    const baseSize = isScreenshot ? 900_000 : 3_200_000 + ((i * 12345) % 8_000_000);
    const dateTaken = now - Math.floor((i / total) * 365 * 3 * dayMs);

    // Hash perceptual: generar hashes repetidos o con 1 bit flip para fotos duplicadas
    let pHash = (BigInt(i % 1200) * 0x123456789abcdef0n).toString(16).padStart(16, '0');
    if (isNearDuplicate) {
      // Duplicado forzado del elemento anterior
      pHash = (BigInt((i - 1) % 1200) * 0x123456789abcdef0n).toString(16).padStart(16, '0');
    }

    const width = isScreenshot ? 1080 : 4032;
    const height = isScreenshot ? 2400 : 3024;

    items.push({
      id: `sim_${i}`,
      name: isScreenshot
        ? `Screenshot_2024${String((i % 12) + 1).padStart(2, '0')}${String((i % 28) + 1).padStart(2, '0')}_${String(i).padStart(6, '0')}.png`
        : `IMG_2024_${String(i).padStart(6, '0')}.jpg`,
      size: baseSize,
      dateTaken,
      width,
      height,
      album,
      mime: isScreenshot ? 'image/png' : 'image/jpeg',
      relativePath: `Pictures/${album}/`,
      blurScore: isBlurry ? 45 : 320,
      pHash,
      isFavorite: i % 250 === 0,
    });
  }
  return items;
}

export class SimulatedBackend implements CleanerBackend {
  private items: MediaItem[] = [];
  private folders: FolderItem[] = [];
  private pending: PendingAction[] = [];
  private trashedSet = new Set<string>();
  private defaultFavoriteFolderId = 'fav_destacadas';
  private analyzedCount = 0;
  private isAnalyzing = false;

  constructor() {
    this.items = generateSimulatedGallery(26000);
    this.folders = [
      { id: 'fav_destacadas', name: 'Favoritas', emoji: '⭐', color: '#f59e0b', count: 42, isDefaultFavorite: true },
      { id: 'fld_viajes', name: 'Viajes', emoji: '✈️', color: '#0ea5e9', count: 180 },
      { id: 'fld_memes', name: 'Memes', emoji: '🐸', color: '#10b981', count: 320 },
      { id: 'fld_trabajo', name: 'Trabajo y Recibos', emoji: '💼', color: '#6366f1', count: 65 },
      { id: 'fld_familia', name: 'Familia', emoji: '❤️', color: '#ec4899', count: 210 },
    ];
  }

  getPlatform(): 'simulated' {
    return 'simulated';
  }

  async init(): Promise<boolean> {
    return true;
  }

  async listPage(
    offset: number,
    limit: number,
    sortOrder: 'date_desc' | 'date_asc' | 'size_desc' | 'random' | 'album' = 'date_desc',
    filters?: { album?: string; onlyScreenshots?: boolean; dateRange?: [number, number] }
  ): Promise<MediaItem[]> {
    // Filtrar los que ya están en la papelera o fueron movidos
    const pendingHandled = new Set(
      this.pending
        .filter((p) => p.action === 'trash' || p.action === 'move')
        .map((p) => p.id)
    );

    let filtered = this.items.filter((item) => !this.trashedSet.has(item.id) && !pendingHandled.has(item.id));

    if (filters?.album) {
      filtered = filtered.filter((it) => it.album === filters.album);
    }
    if (filters?.onlyScreenshots) {
      filtered = filtered.filter((it) => it.album === 'Screenshots');
    }

    if (sortOrder === 'date_desc') {
      filtered.sort((a, b) => b.dateTaken - a.dateTaken);
    } else if (sortOrder === 'date_asc') {
      filtered.sort((a, b) => a.dateTaken - b.dateTaken);
    } else if (sortOrder === 'size_desc') {
      filtered.sort((a, b) => b.size - a.size);
    }

    return filtered.slice(offset, offset + limit);
  }

  thumbUrl(id: string, size = 300): string {
    // Generar un SVG data URI de alta calidad y rendimiento nativo para simular la foto
    const item = this.items.find((it) => it.id === id);
    const label = item ? item.name : id;
    const album = item?.album || 'Galeria';
    const num = parseInt(id.replace('sim_', ''), 10) || 1;
    // Gradiente dinámico agradable según el álbum
    const hues = [210, 160, 280, 35, 340, 190, 45];
    const hue = hues[num % hues.length];

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 400 520">
        <defs>
          <linearGradient id="g_${num}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="hsl(${hue}, 65%, 28%)"/>
            <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 75%, 16%)"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g_${num})"/>
        <circle cx="200" cy="220" r="90" fill="hsl(${hue}, 80%, 42%)" opacity="0.3"/>
        <path d="M 80 400 L 160 300 L 230 360 L 320 250 L 380 400 Z" fill="hsl(${hue}, 70%, 20%)" opacity="0.6"/>
        <text x="200" y="220" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="28" fill="#ffffff" opacity="0.9">📸 ${album}</text>
        <text x="200" y="270" text-anchor="middle" font-family="monospace" font-size="14" fill="#cbd5e1" opacity="0.8">${label}</text>
        <rect x="20" y="20" width="360" height="40" rx="8" fill="rgba(0,0,0,0.3)"/>
        <text x="35" y="45" font-family="system-ui" font-size="14" fill="#94a3b8">Simulated MediaStore • ${((item?.size || 0) / 1024 / 1024).toFixed(1)} MB</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  fullUrl(id: string): string {
    return this.thumbUrl(id, 800);
  }

  async getFolders(): Promise<FolderItem[]> {
    return [...this.folders];
  }

  async createFolder(name: string, emoji: string, color: string): Promise<FolderItem> {
    const id = `fld_${Date.now()}`;
    const newFolder: FolderItem = { id, name, emoji, color, count: 0 };
    this.folders.push(newFolder);
    return newFolder;
  }

  async setFavoriteFolder(folderId: string): Promise<void> {
    this.defaultFavoriteFolderId = folderId;
    this.folders.forEach((f) => {
      f.isDefaultFavorite = f.id === folderId;
    });
  }

  async queueAction(id: string, action: ActionType, targetFolderId?: string): Promise<boolean> {
    const item = this.items.find((it) => it.id === id);
    if (!item) return false;

    if (action === 'favorite_toggle') {
      item.isFavorite = !item.isFavorite;
      return true;
    }

    const folderId = action === 'move' ? (targetFolderId || this.defaultFavoriteFolderId) : undefined;
    this.pending.push({
      id,
      action,
      targetFolderId: folderId,
      timestamp: Date.now(),
      itemSnapshot: { ...item },
    });

    return true;
  }

  async undo(): Promise<PendingAction | null> {
    const last = this.pending.pop();
    return last || null;
  }

  async getPendingActions(): Promise<PendingAction[]> {
    return [...this.pending];
  }

  async getStats(): Promise<CleanerStats> {
    let trashedCount = 0;
    let movedCount = 0;
    let skippedCount = 0;
    let bytesFreed = 0;

    for (const p of this.pending) {
      if (p.action === 'trash') {
        trashedCount++;
        bytesFreed += p.itemSnapshot.size;
      } else if (p.action === 'move') {
        movedCount++;
      } else if (p.action === 'skip') {
        skippedCount++;
      }
    }

    const favoritesCount = this.items.filter((it) => it.isFavorite).length;

    return {
      reviewedCount: this.pending.length,
      trashedCount,
      movedCount,
      skippedCount,
      favoritesCount,
      bytesFreed,
      totalGalleryCount: this.items.length,
    };
  }

  async applyPending(
    mode: 'simulation' | 'real',
    batchSize = 100
  ): Promise<{ success: boolean; appliedCount: number; summary: ApplyPendingSummary }> {
    let toTrashBytes = 0;
    let toTrashCount = 0;
    let toMoveBytes = 0;
    let toMoveCount = 0;

    const folderMap = new Map<string, { count: number; bytes: number }>();

    for (const p of this.pending) {
      if (p.action === 'trash') {
        toTrashCount++;
        toTrashBytes += p.itemSnapshot.size;
        if (mode === 'real') {
          this.trashedSet.add(p.id);
        }
      } else if (p.action === 'move' && p.targetFolderId) {
        toMoveCount++;
        toMoveBytes += p.itemSnapshot.size;
        const current = folderMap.get(p.targetFolderId) || { count: 0, bytes: 0 };
        current.count++;
        current.bytes += p.itemSnapshot.size;
        folderMap.set(p.targetFolderId, current);

        if (mode === 'real') {
          const folder = this.folders.find((f) => f.id === p.targetFolderId);
          if (folder) folder.count++;
        }
      }
    }

    const folderBreakdown = Array.from(folderMap.entries()).map(([fid, data]) => {
      const fName = this.folders.find((f) => f.id === fid)?.name || 'Carpeta';
      return {
        folderId: fid,
        folderName: fName,
        count: data.count,
        bytes: data.bytes,
      };
    });

    const summary: ApplyPendingSummary = {
      toTrashCount,
      toTrashBytes,
      toMoveCount,
      toMoveBytes,
      folderBreakdown,
    };

    if (mode === 'real') {
      this.pending = [];
    }

    return {
      success: true,
      appliedCount: toTrashCount + toMoveCount,
      summary,
    };
  }

  async trashList(): Promise<MediaItem[]> {
    return this.items.filter((it) => this.trashedSet.has(it.id));
  }

  async restore(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      this.trashedSet.delete(id);
    }
    return true;
  }

  async emptyTrash(): Promise<boolean> {
    this.trashedSet.clear();
    return true;
  }

  async startAnalysis(): Promise<void> {
    this.isAnalyzing = true;
    this.analyzedCount = this.items.length;
    this.isAnalyzing = false;
  }

  async getAnalysisStatus(): Promise<AnalysisStatus> {
    return {
      isAnalyzing: this.isAnalyzing,
      analyzedCount: 26000,
      totalCount: 26000,
      progressPercent: 100,
      duplicateGroupsCount: 184,
      blurryCount: 604,
      darkCount: 292,
      screenshotsCount: 702,
    };
  }

  async getDuplicateGroups(): Promise<DuplicateGroup[]> {
    // Clusterizar una muestra de 500 fotos con hashes repetidos para demostración rápida
    const sample = this.items.slice(0, 500);
    return clusterSimilarImages(sample, 4);
  }

  async getBlurry(threshold = 100): Promise<MediaItem[]> {
    return this.items.filter((it) => (it.blurScore || 200) < threshold).slice(0, 100);
  }

  async getDark(): Promise<MediaItem[]> {
    return this.items.filter((it, idx) => idx % 89 === 0).slice(0, 100);
  }

  async getScreenshots(): Promise<MediaItem[]> {
    return this.items.filter((it) => it.album === 'Screenshots').slice(0, 100);
  }
}
