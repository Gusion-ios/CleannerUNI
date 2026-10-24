import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trash2,
  FolderHeart,
  FolderPlus,
  RotateCcw,
  SkipForward,
  Star,
  Info,
  SlidersHorizontal,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Volume2,
  VolumeX,
  Smartphone,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  FolderCheck,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  MediaItem,
  FolderItem,
  PendingAction,
  CleanerStats,
  CleanerBackend,
  ApplyPendingSummary,
  DuplicateGroup,
} from './core/contracts';
import { SimulatedBackend } from './core/backends/simulated-backend';
import { AndroidBridgeBackend } from './core/backends/android-bridge-backend';

// Detectar si estamos dentro del WebView de Android o en navegador/PWA
function createInitialBackend(): CleanerBackend {
  if (typeof window !== 'undefined' && window.AndroidBridge) {
    return new AndroidBridgeBackend();
  }
  return new SimulatedBackend();
}

export default function App() {
  const [backend] = useState<CleanerBackend>(() => createInitialBackend());
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [stats, setStats] = useState<CleanerStats>({
    reviewedCount: 0,
    trashedCount: 0,
    movedCount: 0,
    skippedCount: 0,
    favoritesCount: 0,
    bytesFreed: 0,
    totalGalleryCount: 26000,
  });

  // Ajustes de usuario
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [leftHandedMode, setLeftHandedMode] = useState(false);
  const [decisionThreshold, setDecisionThreshold] = useState(100);

  // Estados visuales y modales
  const [activeTab, setActiveTab] = useState<'deck' | 'intelligence' | 'android_docs'>('deck');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showFolderDrawer, setShowFolderDrawer] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [applyResult, setApplyResult] = useState<{ summary: ApplyPendingSummary; appliedCount: number } | null>(null);

  // Formulario nueva carpeta
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderEmoji, setNewFolderEmoji] = useState('📁');
  const [newFolderColor, setNewFolderColor] = useState('#3b82f6');

  // Análisis inteligente
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [blurryPhotos, setBlurryPhotos] = useState<MediaItem[]>([]);
  const [darkPhotos, setDarkPhotos] = useState<MediaItem[]>([]);
  const [screenshotPhotos, setScreenshotPhotos] = useState<MediaItem[]>([]);
  const [selectedIntelligenceTab, setSelectedIntelligenceTab] = useState<'duplicates' | 'blurry' | 'dark' | 'screenshots'>('duplicates');

  // Gestos Pointer Events
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);

  // Retroalimentación háptica y auditiva
  const triggerFeedback = useCallback((type: 'trash' | 'move' | 'skip') => {
    if (vibrationEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'trash' ? [30, 40, 30] : 35);
    }
    if (soundEnabled && typeof window !== 'undefined' && 'AudioContext' in window) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'trash') {
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        } else if (type === 'move') {
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.exponentialRampToValueAtTime(580, now + 0.14);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
        } else {
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        }
        osc.start(now);
        osc.stop(now + 0.15);
      } catch {
        // Ignorar fallos de audio context
      }
    }
  }, [soundEnabled, vibrationEnabled]);

  // Carga inicial de datos
  const loadInitialData = useCallback(async () => {
    await backend.init();
    const [fetchedPhotos, fetchedFolders, fetchedStats] = await Promise.all([
      backend.listPage(0, 50, 'date_desc'),
      backend.getFolders(),
      backend.getStats(),
    ]);
    setPhotos(fetchedPhotos);
    setFolders(fetchedFolders);
    setStats(fetchedStats);

    // Precargar análisis
    const [dups, blur, dark, screens] = await Promise.all([
      backend.getDuplicateGroups(),
      backend.getBlurry(100),
      backend.getDark(28),
      backend.getScreenshots(),
    ]);
    setDuplicateGroups(dups);
    setBlurryPhotos(blur);
    setDarkPhotos(dark);
    setScreenshotPhotos(screens);
  }, [backend]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Foto actual y siguientes dos fotos (precarga de 3 fotos)
  const currentPhoto = photos[currentIndex];
  const nextPhoto = photos[currentIndex + 1];
  const thirdPhoto = photos[currentIndex + 2];
  const favoriteFolder = folders.find((f) => f.isDefaultFavorite) || folders[0] || {
    id: 'fav_destacadas',
    name: 'Favoritas',
    emoji: '⭐',
    color: '#f59e0b',
    count: 0,
  };

  // Ejecutar decisión de la tarjeta actual
  const handleDecision = useCallback(
    async (action: 'trash' | 'move' | 'skip', targetFolderId?: string) => {
      if (!currentPhoto) return;

      triggerFeedback(action);
      await backend.queueAction(currentPhoto.id, action, targetFolderId);

      // Si fue skip, mover al final de la cola
      if (action === 'skip') {
        setPhotos((prev) => [...prev, currentPhoto]);
      }

      // Avanzar al siguiente elemento
      setCurrentIndex((prev) => prev + 1);
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
      setShowFolderDrawer(false);
      setHoveredFolderId(null);

      // Si nos acercamos al final del lote en memoria, cargar siguiente página (50 más)
      if (currentIndex + 10 >= photos.length) {
        const morePhotos = await backend.listPage(photos.length, 50, 'date_desc');
        if (morePhotos.length > 0) {
          setPhotos((prev) => [...prev, ...morePhotos]);
        }
      }

      // Actualizar estadísticas
      const updatedStats = await backend.getStats();
      setStats(updatedStats);
    },
    [backend, currentIndex, currentPhoto, photos.length, triggerFeedback]
  );

  // Deshacer última acción
  const handleUndo = useCallback(async () => {
    const undone = await backend.undo();
    if (undone) {
      triggerFeedback('skip');
      if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
      const updatedStats = await backend.getStats();
      setStats(updatedStats);
    }
  }, [backend, currentIndex, triggerFeedback]);

  // Alternar favorita
  const handleToggleFavorite = useCallback(async () => {
    if (!currentPhoto) return;
    await backend.queueAction(currentPhoto.id, 'favorite_toggle');
    setPhotos((prev) =>
      prev.map((it, idx) => (idx === currentIndex ? { ...it, isFavorite: !it.isFavorite } : it))
    );
    const updatedStats = await backend.getStats();
    setStats(updatedStats);
    triggerFeedback('move');
  }, [backend, currentIndex, currentPhoto, triggerFeedback]);

  // Gestores de Pointer Events
  const handlePointerDown = (e: React.PointerEvent) => {
    // Verificar si fue doble toque
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      handleToggleFavorite();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    dragStartRef.current = { x: e.clientX, y: e.clientY, time: now };
    setIsDragging(true);

    // Cancelar cualquier temporizador previo
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    // Temporizador para detectar mantener presionado hacia la derecha (>50px y >450ms)
    longPressTimerRef.current = setTimeout(() => {
      if (dragStartRef.current) {
        const currentDiffX = dragOffset.x;
        if (currentDiffX > 45) {
          setShowFolderDrawer(true);
          if (vibrationEnabled && navigator.vibrate) navigator.vibrate(50);
        }
      }
    }, 450);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setDragOffset({ x: dx, y: dy });

    // Si el drawer de carpetas está abierto durante el arrastre, detectar sobre qué carpeta está el puntero
    if (showFolderDrawer) {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const folderCard = element?.closest('[data-folder-id]');
      if (folderCard) {
        const fid = folderCard.getAttribute('data-folder-id');
        setHoveredFolderId(fid);
      } else {
        setHoveredFolderId(null);
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!isDragging) return;

    // Si soltó sobre una carpeta del panel lateral
    if (showFolderDrawer && hoveredFolderId) {
      if (hoveredFolderId === '__new_folder__') {
        setShowNewFolderModal(true);
      } else {
        handleDecision('move', hoveredFolderId);
      }
      setIsDragging(false);
      return;
    }

    const { x, y } = dragOffset;
    const timePassed = dragStartRef.current ? Date.now() - dragStartRef.current.time : 999;

    // Toque simple rápido sin arrastre (< 10px y < 200ms) -> alternar zoom
    if (Math.abs(x) < 10 && Math.abs(y) < 10 && timePassed < 220) {
      setIsZoomed((prev) => !prev);
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
      return;
    }

    // Umbral de decisión (100 px configurable)
    if (x > decisionThreshold) {
      handleDecision('move', favoriteFolder?.id);
    } else if (x < -decisionThreshold) {
      handleDecision('trash');
    } else if (y < -decisionThreshold) {
      handleDecision('skip');
    } else {
      // Regresar al centro si no alcanzó el umbral
      setDragOffset({ x: 0, y: 0 });
      setShowFolderDrawer(false);
    }

    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Atajos de teclado para PC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showApplyModal || showNewFolderModal || showInfoModal) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDecision('trash');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleDecision('move', favoriteFolder?.id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleDecision('skip');
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFolderDrawer((prev) => !prev);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsZoomed((prev) => !prev);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setShowApplyModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [favoriteFolder?.id, handleDecision, handleUndo, showApplyModal, showFolderDrawer, showInfoModal, showNewFolderModal]);

  // Crear nueva carpeta al vuelo
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = await backend.createFolder(newFolderName.trim(), newFolderEmoji, newFolderColor);
    setFolders((prev) => [...prev, created]);
    setShowNewFolderModal(false);
    setNewFolderName('');
    // Si había una foto en espera, moverla a esta nueva carpeta
    if (currentPhoto) {
      handleDecision('move', created.id);
    }
  };

  // Aplicar cambios (Simulación o Real)
  const handleApply = async (mode: 'simulation' | 'real') => {
    const res = await backend.applyPending(mode, 100);
    setApplyResult(res);
    const updatedStats = await backend.getStats();
    setStats(updatedStats);
    if (mode === 'real') {
      // Recargar lista
      const freshPhotos = await backend.listPage(0, 50, 'date_desc');
      setPhotos(freshPhotos);
      setCurrentIndex(0);
    }
  };

  // Cálculos visuales de la tarjeta (rotación y opacidades de sellos)
  const rotationDeg = (dragOffset.x / 100) * 12;
  const trashOpacity = Math.min(1, Math.max(0, -dragOffset.x / decisionThreshold));
  const moveOpacity = Math.min(1, Math.max(0, dragOffset.x / decisionThreshold));
  const skipOpacity = Math.min(1, Math.max(0, -dragOffset.y / decisionThreshold));

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Barra superior con métricas y navegación */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center font-black text-white shadow-md shadow-rose-500/20">
            C
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-slate-100">Cleaner</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {backend.getPlatform() === 'android' ? 'Android 15 Native' : 'PC / PWA'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="text-slate-200 font-bold">{stats.reviewedCount + currentIndex}</span>
              <span>/</span>
              <span>{stats.totalGalleryCount.toLocaleString()} fotos</span>
            </div>
          </div>
        </div>

        {/* Pestañas de modo */}
        <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 text-xs font-medium">
          <button
            onClick={() => setActiveTab('deck')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'deck' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Revisión
          </button>
          <button
            onClick={() => setActiveTab('intelligence')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors ${
              activeTab === 'intelligence' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Inteligencia
          </button>
          <button
            onClick={() => setActiveTab('android_docs')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors ${
              activeTab === 'android_docs' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            Android 15
          </button>
        </div>

        {/* Espacio liberado y botón aplicar */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Liberado</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">{formatBytes(stats.bytesFreed)}</span>
          </div>

          <button
            onClick={() => setShowApplyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Aplicar ({stats.trashedCount + stats.movedCount})</span>
          </button>
        </div>
      </header>

      {/* VISTA 1: MAZO TINDER DE FOTOS */}
      {activeTab === 'deck' && (
        <main className="flex-1 relative flex flex-col items-center justify-center p-3 overflow-hidden">
          {currentPhoto ? (
            <div className="relative w-full max-w-[420px] h-[calc(100vh-140px)] max-h-[640px] flex items-center justify-center">
              {/* Tarjeta de fondo 2 (precarga visual) */}
              {thirdPhoto && (
                <div className="absolute inset-0 scale-[0.91] translate-y-6 opacity-30 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden pointer-events-none transition-transform" />
              )}

              {/* Tarjeta de fondo 1 (siguiente foto) */}
              {nextPhoto && (
                <div className="absolute inset-0 scale-[0.96] translate-y-3 opacity-70 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden pointer-events-none transition-transform shadow-xl">
                  <img
                    src={backend.thumbUrl(nextPhoto.id, 400)}
                    alt={nextPhoto.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4">
                    <div className="text-xs font-semibold text-slate-300 truncate">{nextPhoto.name}</div>
                    <div className="text-[11px] text-slate-400">{nextPhoto.album} • {formatBytes(nextPhoto.size)}</div>
                  </div>
                </div>
              )}

              {/* TARJETA PRINCIPAL INTERACTIVA */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${rotationDeg}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)',
                  touchAction: 'none',
                }}
                className={`relative w-full h-full rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none ${
                  isZoomed ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                {/* Imagen */}
                <img
                  src={isZoomed ? backend.fullUrl(currentPhoto.id) : backend.thumbUrl(currentPhoto.id, 600)}
                  alt={currentPhoto.name}
                  draggable={false}
                  className={`w-full h-full ${isZoomed ? 'object-contain bg-black' : 'object-cover'} pointer-events-none`}
                />

                {/* Sello BORRAR (deslizar a la izquierda) */}
                <div
                  style={{ opacity: trashOpacity }}
                  className="absolute top-6 right-6 border-4 border-rose-500 text-rose-500 bg-rose-950/60 font-black tracking-widest text-xl px-4 py-1.5 rounded-xl uppercase rotate-12 pointer-events-none backdrop-blur-sm shadow-lg shadow-rose-900/40"
                >
                  BORRAR
                </div>

                {/* Sello CARPETA / FAVORITA (deslizar a la derecha) */}
                <div
                  style={{ opacity: moveOpacity }}
                  className="absolute top-6 left-6 border-4 border-emerald-400 text-emerald-400 bg-emerald-950/60 font-black tracking-widest text-lg px-4 py-1.5 rounded-xl uppercase -rotate-12 pointer-events-none backdrop-blur-sm shadow-lg shadow-emerald-900/40 flex items-center gap-2"
                >
                  <span>{favoriteFolder.emoji}</span>
                  <span>{favoriteFolder.name}</span>
                </div>

                {/* Sello DESPUÉS / OMITIR (deslizar hacia arriba) */}
                <div
                  style={{ opacity: skipOpacity }}
                  className="absolute bottom-24 inset-x-0 mx-auto w-max border-4 border-indigo-400 text-indigo-400 bg-indigo-950/70 font-black tracking-widest text-sm px-5 py-1.5 rounded-xl uppercase pointer-events-none backdrop-blur-sm shadow-lg"
                >
                  DECIDIR DESPUÉS
                </div>

                {/* Indicador de estrella favorita */}
                {currentPhoto.isFavorite && (
                  <div className="absolute top-4 left-4 bg-amber-500/90 text-slate-950 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-md shadow-amber-500/30">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>Favorita</span>
                  </div>
                )}

                {/* Botón info y zoom superpuestos en esquina */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsZoomed(!isZoomed);
                    }}
                    className="p-2 rounded-full bg-slate-900/70 backdrop-blur-md text-slate-200 hover:bg-slate-900 border border-slate-700/60"
                    title="Alternar Zoom (o toca una vez)"
                  >
                    {isZoomed ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInfoModal(true);
                    }}
                    className="p-2 rounded-full bg-slate-900/70 backdrop-blur-md text-slate-200 hover:bg-slate-900 border border-slate-700/60"
                    title="Información detallada"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>

                {/* Overlay inferior con metadatos y atajos táctiles */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-12 pb-4 px-4 text-slate-200">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold truncate text-white">{currentPhoto.name}</h2>
                    <span className="text-xs font-mono text-emerald-400 font-semibold shrink-0">
                      {formatBytes(currentPhoto.size)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                    <span>
                      {currentPhoto.album} • {new Date(currentPhoto.dateTaken).toLocaleDateString()}
                    </span>
                    <span>
                      {currentPhoto.width} × {currentPhoto.height}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 max-w-md">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">¡Todo al día!</h3>
              <p className="text-sm text-slate-400 mb-6">
                Has revisado todas las fotos en la cola actual. Pulsa Aplicar para consolidar tus decisiones en el almacenamiento.
              </p>
              <button
                onClick={() => setShowApplyModal(true)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl"
              >
                Revisar resumen y Aplicar
              </button>
            </div>
          )}

          {/* PANEL LATERAL DE CARPETAS AL MANTENER PRESIONADO O PULSAR F */}
          {showFolderDrawer && (
            <div
              className={`absolute top-0 bottom-0 ${
                leftHandedMode ? 'left-0' : 'right-0'
              } w-72 bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/80 p-4 shadow-2xl z-40 flex flex-col justify-between animate-in slide-in-from-right duration-200`}
            >
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <FolderHeart className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm">Mover a Carpeta</span>
                  </div>
                  <button
                    onClick={() => setShowFolderDrawer(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Suelta la foto sobre la carpeta o pulsa para mover directamente:
                </p>

                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                  {folders.map((folder) => {
                    const isHovered = hoveredFolderId === folder.id;
                    return (
                      <div
                        key={folder.id}
                        data-folder-id={folder.id}
                        onClick={() => handleDecision('move', folder.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isHovered
                            ? 'bg-emerald-600/30 border-emerald-400 scale-[1.02]'
                            : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{folder.emoji}</span>
                          <div>
                            <div className="text-xs font-semibold text-slate-200">{folder.name}</div>
                            <div className="text-[10px] text-slate-400">{folder.count} fotos</div>
                          </div>
                        </div>
                        {folder.isDefaultFavorite && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 rounded">
                            Swipe rápido
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Opción Crear Nueva Carpeta */}
                  <div
                    data-folder-id="__new_folder__"
                    onClick={() => setShowNewFolderModal(true)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed transition-all cursor-pointer ${
                      hoveredFolderId === '__new_folder__'
                        ? 'bg-indigo-600/30 border-indigo-400'
                        : 'border-slate-700 hover:border-slate-500 bg-slate-850/50'
                    }`}
                  >
                    <FolderPlus className="w-5 h-5 text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-300">+ Nueva Carpeta</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 text-center pt-2 border-t border-slate-800">
                Mantén arrastre a la derecha 450 ms para abrir este menú al vuelo
              </div>
            </div>
          )}

          {/* BARRA INFERIOR DE BOTONES DE ACCIÓN RÁPIDA */}
          <footer
            className={`w-full max-w-[420px] pt-3 pb-2 flex items-center justify-between px-2 ${
              leftHandedMode ? 'flex-row-reverse' : ''
            }`}
          >
            {/* 1. Deshacer */}
            <button
              onClick={handleUndo}
              disabled={currentIndex === 0 && stats.reviewedCount === 0}
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-400 flex items-center justify-center border border-slate-700 shadow-md transition-transform active:scale-95"
              title="Deshacer (Z)"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* 2. Papelera (Izquierda) */}
            <button
              onClick={() => handleDecision('trash')}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
              title="Borrar / Papelera (Flecha Izq)"
            >
              <Trash2 className="w-6 h-6" />
            </button>

            {/* 3. Omitir / Decidir después (Arriba) */}
            <button
              onClick={() => handleDecision('skip')}
              className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 shadow-md transition-transform active:scale-95"
              title="Omitir (Flecha Arriba)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* 4. Mover a Carpeta Favorita (Derecha) */}
            <button
              onClick={() => handleDecision('move', favoriteFolder?.id)}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-transform active:scale-95"
              title={`Mover a ${favoriteFolder.name} (Flecha Der)`}
            >
              <FolderHeart className="w-6 h-6" />
            </button>

            {/* 5. Panel de Carpetas */}
            <button
              onClick={() => setShowFolderDrawer((prev) => !prev)}
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-indigo-400 flex items-center justify-center border border-slate-700 shadow-md transition-transform active:scale-95"
              title="Todas las Carpetas (F)"
            >
              <Layers className="w-5 h-5" />
            </button>
          </footer>
        </main>
      )}

      {/* VISTA 2: INTELIGENCIA LOCAL (Duplicados, Borrosas, Oscuras, Capturas) */}
      {activeTab === 'intelligence' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Análisis Inteligente Local</span>
              </h2>
              <p className="text-xs text-slate-400">
                Cálculo 100% en el dispositivo con dHash (64-bit), LSH Bucketing y Laplaciano. Sin internet.
              </p>
            </div>
            <button
              onClick={() => backend.startAnalysis()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Re-analizar
            </button>
          </div>

          {/* Sub-pestañas de inteligencia */}
          <div className="flex gap-2 border-b border-slate-800 pb-2 mb-4 text-xs font-semibold">
            <button
              onClick={() => setSelectedIntelligenceTab('duplicates')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedIntelligenceTab === 'duplicates'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Duplicadas y Parecidas ({duplicateGroups.length} grupos)
            </button>
            <button
              onClick={() => setSelectedIntelligenceTab('blurry')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedIntelligenceTab === 'blurry'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Borrosas ({blurryPhotos.length})
            </button>
            <button
              onClick={() => setSelectedIntelligenceTab('dark')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedIntelligenceTab === 'dark'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Oscuras / Accidentales ({darkPhotos.length})
            </button>
            <button
              onClick={() => setSelectedIntelligenceTab('screenshots')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                selectedIntelligenceTab === 'screenshots'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Capturas de Pantalla ({screenshotPhotos.length})
            </button>
          </div>

          {/* Contenido según pestaña */}
          {selectedIntelligenceTab === 'duplicates' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 bg-slate-900 p-3 rounded-lg border border-slate-800">
                Se detectaron fotos similares o ráfagas mediante distancia de Hamming ≤ 4. La mejor toma (marcada con check verde) se determinó por nitidez y resolución. Pulsa &quot;Borrar restantes&quot; para enviar las copias redundantes a la papelera.
              </p>
              {duplicateGroups.map((group) => (
                <div key={group.groupId} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300">{group.items.length} fotos similares</span>
                    <button
                      onClick={() => {
                        // Marcar todas excepto la mejor para papelera
                        group.items
                          .filter((it) => it.id !== group.bestItemId)
                          .forEach((it) => backend.queueAction(it.id, 'trash'));
                        triggerFeedback('trash');
                        backend.getStats().then(setStats);
                      }}
                      className="text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20"
                    >
                      Conservar mejor y borrar restantes
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {group.items.map((item) => {
                      const isBest = item.id === group.bestItemId;
                      return (
                        <div
                          key={item.id}
                          className={`relative rounded-lg overflow-hidden border ${
                            isBest ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-800'
                          }`}
                        >
                          <img
                            src={backend.thumbUrl(item.id, 240)}
                            alt={item.name}
                            className="w-full h-32 object-cover"
                          />
                          {isBest && (
                            <div className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                              ⭐ Mejor toma
                            </div>
                          )}
                          <div className="p-1.5 bg-slate-950/80 text-[10px] text-slate-300">
                            <div>{item.width}×{item.height}</div>
                            <div className="text-slate-400">{formatBytes(item.size)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedIntelligenceTab === 'blurry' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {blurryPhotos.map((item) => (
                <div key={item.id} className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900 group">
                  <img src={backend.thumbUrl(item.id, 200)} alt={item.name} className="w-full h-28 object-cover opacity-80" />
                  <div className="p-1.5 text-[10px]">
                    <span className="text-rose-400 font-bold">Varianza: {item.blurScore || 45}</span>
                    <div className="truncate text-slate-400">{item.name}</div>
                  </div>
                  <button
                    onClick={() => {
                      backend.queueAction(item.id, 'trash');
                      triggerFeedback('trash');
                      backend.getStats().then(setStats);
                    }}
                    className="w-full py-1 bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-[10px]"
                  >
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedIntelligenceTab === 'dark' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {darkPhotos.map((item) => (
                <div key={item.id} className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                  <img src={backend.thumbUrl(item.id, 200)} alt={item.name} className="w-full h-28 object-cover" />
                  <div className="p-1.5 text-[10px] text-slate-400 truncate">{item.name}</div>
                  <button
                    onClick={() => {
                      backend.queueAction(item.id, 'trash');
                      triggerFeedback('trash');
                      backend.getStats().then(setStats);
                    }}
                    className="w-full py-1 bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-[10px]"
                  >
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedIntelligenceTab === 'screenshots' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {screenshotPhotos.map((item) => (
                <div key={item.id} className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                  <img src={backend.thumbUrl(item.id, 200)} alt={item.name} className="w-full h-28 object-cover" />
                  <div className="p-1.5 text-[10px] text-slate-400 truncate">{item.name}</div>
                  <button
                    onClick={() => {
                      backend.queueAction(item.id, 'move', 'fld_trabajo');
                      triggerFeedback('move');
                      backend.getStats().then(setStats);
                    }}
                    className="w-full py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-[10px]"
                  >
                    Archivar en Trabajo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA 3: GUÍA PASO A PASO Y EXPORTADOR ANDROID 15 (KOTLIN) */}
      {activeTab === 'android_docs' && (
        <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Arquitectura Android 15 & Puente WebView</h2>
                <p className="text-xs text-slate-400">
                  Paquete: <code className="text-indigo-400">com.cleaner.app</code> • minSdk: 26 • targetSdk: 35 (Android 15)
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mt-2">
              Para garantizar que 26.000 fotos se procesen con 60 FPS sin saturar la memoria del celular, las miniaturas se cargan con <code className="text-emerald-300">ContentResolver.loadThumbnail</code> e interceptadas con <code className="text-emerald-300">WebViewAssetLoader</code> en la URL virtual <code className="text-amber-300">https://appassets.androidplatform.net/media/&lt;id&gt;</code> sin convertir a base64.
            </p>
          </div>

          <div className="space-y-4">
            <div className="border border-slate-800 rounded-xl bg-slate-900/80 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  app/src/main/java/com/cleaner/app/MediaBridge.kt
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">Kotlin @JavascriptInterface</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                Conecta la interfaz JS con Room y MediaStore. Images. Media de Android 15 mediante consultas paginadas por Bundle.
              </p>
            </div>

            <div className="border border-slate-800 rounded-xl bg-slate-900/80 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-indigo-400">
                  app/src/main/java/com/cleaner/app/MainActivity.kt
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">Activity Result API</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                Configura WebViewAssetLoader, gestiona permisos READ_MEDIA_IMAGES y READ_MEDIA_VISUAL_USER_SELECTED de Android 14/15, y maneja ActivityResultLauncher para tandas con createTrashRequest.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESUMEN Y APLICAR TANDAS (Simulación vs Real) */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Resumen de Decisiones Pendientes</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Revisa el impacto antes de aplicar. En Android 15, el sistema operativo pedirá confirmación por cada tanda de 100 fotos.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-semibold text-rose-200">Fotos a Papelera</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-rose-400">{stats.trashedCount} fotos</div>
                  <div className="text-[10px] text-slate-400">{formatBytes(stats.bytesFreed)} a liberar</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <FolderHeart className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-200">Fotos a Organizar</span>
                </div>
                <div className="text-xs font-bold text-emerald-400">{stats.movedCount} fotos</div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700">
                <div className="flex items-center gap-2">
                  <SkipForward className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300">Omitidas para después</span>
                </div>
                <div className="text-xs font-bold text-slate-300">{stats.skippedCount} fotos</div>
              </div>
            </div>

            {applyResult && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl mb-4 text-xs text-emerald-300">
                ✅ Se procesaron {applyResult.appliedCount} fotos correctamente.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleApply('simulation')}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
              >
                Modo Simulación
              </button>
              <button
                onClick={() => handleApply('real')}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30"
              >
                Aplicar Cambios Reales
              </button>
            </div>

            <button
              onClick={() => {
                setShowApplyModal(false);
                setApplyResult(null);
              }}
              className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CREAR NUEVA CARPETA */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl"
          >
            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              <span>Nueva Carpeta de Destino</span>
            </h3>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Nombre</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="ej. Memes, Recibos, Fin de Año"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={newFolderEmoji}
                    onChange={(e) => setNewFolderEmoji(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-center text-sm text-white"
                    maxLength={2}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-400 block mb-1">Color</label>
                  <input
                    type="color"
                    value={newFolderColor}
                    onChange={(e) => setNewFolderColor(e.target.value)}
                    className="w-full h-9 bg-slate-800 border border-slate-700 rounded-lg px-1 py-1 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-bold"
              >
                Crear y Mover
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: INFO DETALLADA DE LA FOTO */}
      {showInfoModal && currentPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>Detalles del Archivo</span>
            </h3>

            <div className="space-y-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800 mb-4 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Nombre:</span>
                <span className="font-semibold truncate max-w-[200px]">{currentPhoto.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Álbum:</span>
                <span className="font-semibold">{currentPhoto.album}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tamaño:</span>
                <span className="font-semibold text-emerald-400">{formatBytes(currentPhoto.size)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resolución:</span>
                <span className="font-semibold">{currentPhoto.width} × {currentPhoto.height} px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha:</span>
                <span>{new Date(currentPhoto.dateTaken).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MIME:</span>
                <span>{currentPhoto.mime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hash (dHash):</span>
                <span className="text-[10px] text-amber-300">{currentPhoto.pHash}</span>
              </div>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
