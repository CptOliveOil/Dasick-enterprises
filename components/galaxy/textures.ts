'use client';

import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

/** Soft radial falloff used for planet bloom and the command core's corona. */
export function glowTexture(colour: string): THREE.Texture {
  const key = `glow:${colour}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, hexToRgba(colour, 0.9));
  gradient.addColorStop(0.25, hexToRgba(colour, 0.35));
  gradient.addColorStop(0.6, hexToRgba(colour, 0.08));
  gradient.addColorStop(1, hexToRgba(colour, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/**
 * Procedural planet surface. Value noise rendered once per colour at low
 * resolution — cheaper than shipping texture files and enough to stop planets
 * reading as flat plastic spheres.
 */
export function surfaceTexture(colour: string, roughness: number): THREE.Texture {
  const key = `surface:${colour}:${roughness.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const width = 256;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);

  const base = new THREE.Color(colour);
  const seed = hashString(key);
  const random = mulberry32(seed);

  // Layered blobs at decreasing size read as cloud bands and landmasses.
  for (let layer = 0; layer < 3; layer += 1) {
    const blobs = 26 - layer * 6;
    const radius = (40 - layer * 11) * (0.6 + roughness * 0.8);
    for (let i = 0; i < blobs; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const shade = base.clone();
      const delta = (random() - 0.5) * 0.45 * (0.4 + roughness);
      shade.offsetHSL(delta * 0.05, delta * 0.2, delta * 0.35);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `#${shade.getHexString()}`);
      gradient.addColorStop(1, hexToRgba(`#${shade.getHexString()}`, 0));
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  cache.set(key, texture);
  return texture;
}

function hexToRgba(hex: string, alpha: number): string {
  const colour = new THREE.Color(hex);
  const r = Math.round(colour.r * 255);
  const g = Math.round(colour.g * 255);
  const b = Math.round(colour.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
