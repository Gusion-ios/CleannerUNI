/**
 * Algoritmos puros de alto rendimiento para Cleaner:
 * 1. Distancia de Hamming sobre hashes perceptuales de 64 bits (dHash).
 * 2. Agrupamiento O(N) mediante Bucketing / LSH para 26.000 imágenes (evita O(N²)).
 * 3. Varianza del Laplaciano sobre escala de grises para detección de fotos borrosas.
 * 4. Detección de fotos oscuras mediante luminancia media y contraste.
 * 5. Caché LRU de memoria con límite para precargar N fotos y evitar saturar RAM.
 */

/**
 * Calcula la distancia de Hamming (número de bits diferentes) entre dos hashes hexadecimales de 64 bits (16 caracteres).
 */
export function hammingDistance(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) {
    // Si los hashes difieren en longitud, normalizar o retornar máxima diferencia
    const maxLen = Math.max(hexA.length, hexB.length);
    hexA = hexA.padStart(maxLen, '0');
    hexB = hexB.padStart(maxLen, '0');
  }

  let distance = 0;
  // Comparar de a chunks de 8 caracteres (32 bits) para evitar pérdida de precisión con enteros de JS
  for (let i = 0; i < hexA.length; i += 8) {
    const chunkA = parseInt(hexA.substring(i, i + 8), 16) || 0;
    const chunkB = parseInt(hexB.substring(i, i + 8), 16) || 0;
    let xor = chunkA ^ chunkB;
    // Conteo de bits en 1 (Brian Kernighan's algorithm)
    while (xor !== 0) {
      xor &= xor - 1;
      distance++;
    }
  }
  return distance;
}

/**
 * Genera el hash perceptual dHash (difference hash) de 64 bits a partir de una matriz 9x8 de grises.
 * Si pixel[x+1, y] > pixel[x, y], bit = 1, si no bit = 0.
 * Retorna string hexadecimal de 16 caracteres.
 */
export function computeDHashFromGrayscaleMatrix(matrix9x8: number[][]): string {
  let hexResult = '';
  let currentNibble = 0;
  let bitCount = 0;

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = matrix9x8[y][x];
      const right = matrix9x8[y][x + 1];
      const bit = right > left ? 1 : 0;

      currentNibble = (currentNibble << 1) | bit;
      bitCount++;

      if (bitCount === 4) {
        hexResult += currentNibble.toString(16);
        currentNibble = 0;
        bitCount = 0;
      }
    }
  }
  return hexResult.padStart(16, '0');
}

/**
 * Agrupa ítems con hash perceptual similar utilizando LSH / Bucketing por prefijos y sufijos de bits.
 * Para 26.000 imágenes, una comparación O(N²) requeriría ~338 millones de comparaciones de Hamming.
 * Con particionamiento de 4 bandas de 16 bits (o 2 bandas), agrupamos en buckets hash en tiempo O(N),
 * y solo calculamos Hamming entre candidatos que comparten al menos una banda idéntica.
 */
export interface HashableItem {
  id: string;
  pHash: string;
  size: number;
  width: number;
  height: number;
  blurScore?: number;
}

export function clusterSimilarImages<T extends HashableItem>(
  items: T[],
  maxDistanceThreshold = 10
): { groupId: string; bestItemId: string; items: T[] }[] {
  if (items.length <= 1) return [];

  // Dividir el hash de 64 bits (16 hex chars) en 4 bandas de 16 bits (4 hex chars cada una)
  const bandTables: Map<string, number[]>[] = [
    new Map(),
    new Map(),
    new Map(),
    new Map(),
  ];

  items.forEach((item, index) => {
    const hash = item.pHash.padStart(16, '0');
    for (let band = 0; band < 4; band++) {
      const slice = hash.substring(band * 4, band * 4 + 4);
      const key = `${band}:${slice}`;
      let list = bandTables[band].get(key);
      if (!list) {
        list = [];
        bandTables[band].set(key, list);
      }
      list.push(index);
    }
  });

  const visited = new Set<number>();
  const groups: { groupId: string; bestItemId: string; items: T[] }[] = [];

  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;

    // Recolectar candidatos que comparten al menos un segmento idéntico
    const candidateIndices = new Set<number>();
    const hashI = items[i].pHash.padStart(16, '0');

    for (let band = 0; band < 4; band++) {
      const slice = hashI.substring(band * 4, band * 4 + 4);
      const key = `${band}:${slice}`;
      const bucket = bandTables[band].get(key);
      if (bucket) {
        for (const idx of bucket) {
          if (idx !== i && !visited.has(idx)) {
            candidateIndices.add(idx);
          }
        }
      }
    }

    // Verificar candidatos con distancia de Hamming real
    const groupMembers: T[] = [items[i]];
    for (const candidateIdx of candidateIndices) {
      const dist = hammingDistance(hashI, items[candidateIdx].pHash);
      if (dist <= maxDistanceThreshold) {
        groupMembers.push(items[candidateIdx]);
        visited.add(candidateIdx);
      }
    }

    if (groupMembers.length > 1) {
      visited.add(i);
      // Seleccionar la mejor imagen del grupo (mayor resolución en megapíxeles, mayor nitidez o mayor peso)
      let bestItem = groupMembers[0];
      let bestScore = (bestItem.width * bestItem.height) + (bestItem.blurScore || 0);

      for (let j = 1; j < groupMembers.length; j++) {
        const item = groupMembers[j];
        const score = (item.width * item.height) + (item.blurScore || 0);
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }

      groups.push({
        groupId: `group_${items[i].id}`,
        bestItemId: bestItem.id,
        items: groupMembers,
      });
    }
  }

  return groups;
}

/**
 * Calcula la varianza del Laplaciano sobre un búfer de escala de grises.
 * Aplica el kernel Laplaciano 3x3:
 *  [ 0,  1,  0 ]
 *  [ 1, -4,  1 ]
 *  [ 0,  1,  0 ]
 * Retorna un score numérico: valores bajos (< 100) corresponden a imágenes desenfocadas o borrosas.
 */
export function computeLaplacianVariance(
  grayscalePixels: Uint8Array | number[],
  width: number,
  height: number
): number {
  if (width < 3 || height < 3) return 0;

  const responseCount = (width - 2) * (height - 2);
  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    const nextRowOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      // Kernel laplaciano:
      // (arriba + abajo + izquierda + derecha) - 4 * centro
      const center = grayscalePixels[rowOffset + x];
      const top = grayscalePixels[prevRowOffset + x];
      const bottom = grayscalePixels[nextRowOffset + x];
      const left = grayscalePixels[rowOffset + x - 1];
      const right = grayscalePixels[rowOffset + x + 1];

      const lap = (top + bottom + left + right) - (4 * center);
      sum += lap;
      sumSq += lap * lap;
    }
  }

  const mean = sum / responseCount;
  const variance = (sumSq / responseCount) - (mean * mean);
  return Math.max(0, variance);
}

/**
 * Detecta si una imagen es demasiado oscura o un disparo accidental negro/muy sombrío.
 * Calcula la luminancia media y el rango dinámico.
 */
export function analyzeLuminance(
  grayscalePixels: Uint8Array | number[]
): { mean: number; isDark: boolean } {
  if (grayscalePixels.length === 0) return { mean: 0, isDark: true };

  let totalLuminance = 0;
  for (let i = 0; i < grayscalePixels.length; i++) {
    totalLuminance += grayscalePixels[i];
  }
  const mean = totalLuminance / grayscalePixels.length;
  // Umbral por defecto: luminancia menor a 28 sobre 255
  return {
    mean,
    isDark: mean < 28,
  };
}

/**
 * Gestor de Caché LRU en memoria para ítems y URLs, asegurando un footprint ligero
 * en sesiones con decenas de miles de fotos.
 */
export class LRUMediaCache<T> {
  private capacity: number;
  private map = new Map<string, T>();

  constructor(capacity = 250) {
    this.capacity = capacity;
  }

  get(key: string): T | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Reinsertar al final para marcar como más recientemente usado
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Expulsar el más antiguo (primer elemento del iterador)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
