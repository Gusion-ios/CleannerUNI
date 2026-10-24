import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hammingDistance,
  computeDHashFromGrayscaleMatrix,
  clusterSimilarImages,
  computeLaplacianVariance,
  analyzeLuminance,
  LRUMediaCache,
} from './algorithms';

test('hammingDistance calculates exact bit differences', () => {
  assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(hammingDistance('0000000000000000', '0000000000000001'), 1);
  assert.equal(hammingDistance('ffffffffffffffff', 'ffffffffffffffff'), 0);
  // f -> 0 is 4 bit flips * 16 hex chars = 64
  assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
  assert.equal(hammingDistance('000000000000000f', '0000000000000000'), 4);
});

test('computeDHashFromGrayscaleMatrix produces deterministic 16-hex hash', () => {
  // Matriz plana donde la columna derecha siempre es más brillante: todos los bits deben ser 1 -> ffffffffffffffff
  const ascendingMatrix: number[][] = [];
  for (let y = 0; y < 8; y++) {
    ascendingMatrix.push([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  }
  const hashAsc = computeDHashFromGrayscaleMatrix(ascendingMatrix);
  assert.equal(hashAsc.length, 16);
  assert.equal(hashAsc, 'ffffffffffffffff');

  // Matriz plana donde la columna derecha siempre es más oscura: todos los bits son 0 -> 0000000000000000
  const descendingMatrix: number[][] = [];
  for (let y = 0; y < 8; y++) {
    descendingMatrix.push([80, 70, 60, 50, 40, 30, 20, 10, 0]);
  }
  const hashDesc = computeDHashFromGrayscaleMatrix(descendingMatrix);
  assert.equal(hashDesc, '0000000000000000');
});

test('clusterSimilarImages groups near-duplicate images and identifies best quality', () => {
  const items = [
    { id: 'img1', pHash: '1234abcd5678ef01', size: 1000000, width: 1920, height: 1080, blurScore: 180 },
    // Similar to img1 (distance = 1 bit flip: '01' -> '03')
    { id: 'img2', pHash: '1234abcd5678ef03', size: 2500000, width: 3840, height: 2160, blurScore: 320 },
    // Completely unrelated
    { id: 'img3', pHash: 'ffff0000ffff0000', size: 800000, width: 1280, height: 720, blurScore: 100 },
  ];

  const groups = clusterSimilarImages(items, 6);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  // img2 has 4K resolution and higher blur score, should be selected as bestItemId
  assert.equal(groups[0].bestItemId, 'img2');
});

test('computeLaplacianVariance detects sharpness vs blur', () => {
  // Imagen completamente uniforme (sin bordes) -> varianza 0
  const flatPixels = new Uint8Array(25).fill(128);
  const flatVar = computeLaplacianVariance(flatPixels, 5, 5);
  assert.equal(flatVar, 0);

  // Imagen con alto contraste y bordes nítidos
  const sharpPixels = new Uint8Array([
    0, 255, 0, 255, 0,
    255, 0, 255, 0, 255,
    0, 255, 0, 255, 0,
    255, 0, 255, 0, 255,
    0, 255, 0, 255, 0,
  ]);
  const sharpVar = computeLaplacianVariance(sharpPixels, 5, 5);
  assert.ok(sharpVar > 1000, `Varianza esperada alta, obtenida: ${sharpVar}`);
});

test('analyzeLuminance detects dark and accidental black photos', () => {
  const darkImage = new Uint8Array([5, 10, 12, 15, 8, 4, 18, 9]);
  const darkResult = analyzeLuminance(darkImage);
  assert.equal(darkResult.isDark, true);
  assert.ok(darkResult.mean < 28);

  const daylightImage = new Uint8Array([140, 160, 200, 180, 190, 210]);
  const brightResult = analyzeLuminance(daylightImage);
  assert.equal(brightResult.isDark, false);
  assert.ok(brightResult.mean > 150);
});

test('LRUMediaCache respects capacity limit and eviction order', () => {
  const cache = new LRUMediaCache<string>(3);
  cache.set('a', 'alpha');
  cache.set('b', 'beta');
  cache.set('c', 'gamma');

  assert.equal(cache.size(), 3);
  assert.equal(cache.get('a'), 'alpha'); // Accesed 'a', making 'b' oldest

  cache.set('d', 'delta'); // Should evict 'b'
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.has('d'), true);
});
