/**
 * Contrato formal del Backend para la aplicación Cleaner.
 * Compartido de forma estricta entre:
 * 1) AndroidBackend (puente WebView @JavascriptInterface con Android 15 / Kotlin)
 * 2) PCBackend (File System Access API + IndexedDB + Web Workers)
 * 3) SimulatedBackend (entorno de pruebas y desarrollo)
 */

export type ActionType = 'trash' | 'move' | 'skip' | 'favorite_toggle';

export interface MediaItem {
  id: string;             // ID único (ID numérico de MediaStore en Android o path relativo en PC)
  name: string;           // Nombre con extensión (ej. IMG_20241024_1120.jpg)
  size: number;           // Tamaño en bytes
  dateTaken: number;      // Timestamp epoch en milisegundos
  width: number;          // Ancho en píxeles
  height: number;         // Alto en píxeles
  album: string;          // Álbum o carpeta origen (ej. "Camera", "Screenshots", "WhatsApp")
  mime: string;           // MIME type (ej. "image/jpeg", "image/png", "image/webp")
  relativePath?: string;  // Ruta relativa original
  isFavorite?: boolean;   // Marcada con estrella (protegida de borrado)
  blurScore?: number;     // Varianza del Laplaciano (opcional si ya analizado)
  pHash?: string;         // Hash perceptual 64-bit hexadecimal
}

export interface FolderItem {
  id: string;             // Identificador de carpeta (ej. "memes", "trabajo", "familia")
  name: string;           // Nombre visible de la carpeta
  emoji: string;          // Emoji distintivo
  color: string;          // Color hex o clave CSS
  count: number;          // Conteo aproximado de fotos
  isDefaultFavorite?: boolean; // Si es la carpeta rápida de swipe a la derecha
}

export interface PendingAction {
  id: string;             // ID de la foto
  action: ActionType;     // Tipo de acción
  targetFolderId?: string;// Carpeta destino si la acción es 'move'
  timestamp: number;      // Marca de tiempo de la decisión
  itemSnapshot: MediaItem;// Copia para poder revertir/mostrar resumen sin recargar
}

export interface CleanerStats {
  reviewedCount: number;
  trashedCount: number;
  movedCount: number;
  skippedCount: number;
  favoritesCount: number;
  bytesFreed: number;
  totalGalleryCount: number;
}

export interface ApplyPendingSummary {
  toTrashCount: number;
  toTrashBytes: number;
  toMoveCount: number;
  toMoveBytes: number;
  folderBreakdown: { folderId: string; folderName: string; count: number; bytes: number }[];
}

export interface AnalysisStatus {
  isAnalyzing: boolean;
  analyzedCount: number;
  totalCount: number;
  progressPercent: number;
  duplicateGroupsCount: number;
  blurryCount: number;
  darkCount: number;
  screenshotsCount: number;
}

export interface DuplicateGroup {
  groupId: string;
  bestItemId: string; // Sugerida para conservar (mayor resolución o nitidez)
  items: MediaItem[];
}

export interface CleanerBackend {
  // Inicialización y estado de plataforma
  getPlatform(): 'android' | 'pc' | 'simulated';
  init(): Promise<boolean>;

  // Paginación de galería
  listPage(
    offset: number,
    limit: number,
    sortOrder?: 'date_desc' | 'date_asc' | 'size_desc' | 'random' | 'album',
    filters?: { album?: string; onlyScreenshots?: boolean; dateRange?: [number, number] }
  ): Promise<MediaItem[]>;

  // URLs seguras de miniaturas y resolución original
  // Android: https://appassets.androidplatform.net/media/<id>?s=thumb|full
  // PC: blob: URL o ObjectURL creado localmente
  thumbUrl(id: string, size?: number): string;
  fullUrl(id: string): string;

  // Gestión de carpetas
  getFolders(): Promise<FolderItem[]>;
  createFolder(name: string, emoji: string, color: string): Promise<FolderItem>;
  setFavoriteFolder(folderId: string): Promise<void>;

  // Cola de decisiones (no toca el disco hasta applyPending)
  queueAction(id: string, action: ActionType, targetFolderId?: string): Promise<boolean>;
  undo(): Promise<PendingAction | null>;
  getPendingActions(): Promise<PendingAction[]>;

  // Estadísticas acumuladas
  getStats(): Promise<CleanerStats>;

  // Aplicación por tandas con modo simulación
  applyPending(
    mode: 'simulation' | 'real',
    batchSize?: number
  ): Promise<{ success: boolean; appliedCount: number; summary: ApplyPendingSummary }>;

  // Papelera y restauración
  trashList(): Promise<MediaItem[]>;
  restore(ids: string[]): Promise<boolean>;
  emptyTrash(): Promise<boolean>;

  // Análisis inteligente en segundo plano
  startAnalysis(): Promise<void>;
  getAnalysisStatus(): Promise<AnalysisStatus>;
  getDuplicateGroups(): Promise<DuplicateGroup[]>;
  getBlurry(threshold?: number): Promise<MediaItem[]>;
  getDark(threshold?: number): Promise<MediaItem[]>;
  getScreenshots(): Promise<MediaItem[]>;
}
