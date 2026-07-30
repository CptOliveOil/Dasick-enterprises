'use client';

import * as THREE from 'three';
import { hashString, mulberry32 } from './hash';
import type { SurfaceStyle } from './layout';

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
 * Procedural planet surface.
 *
 * Three patterns rather than one, because eighteen planets that differ only in
 * hue are eighteen planets the operator has to read the label of. A banded
 * world, a mottled world and a streaked world are told apart at a glance even
 * before the colour registers.
 *
 * Drawn once per (colour, style) combination onto a canvas and cached: a
 * handful of 512×256 canvases in total, no texture files to ship, and no
 * per-frame cost at all.
 */
export function surfaceTexture(
  colour: string,
  roughness: number,
  style: SurfaceStyle,
  seed: string,
): THREE.Texture {
  const key = `surface:${colour}:${roughness.toFixed(2)}:${style}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Push saturation up front: every layer below desaturates as it stacks, and a
  // pastel planet loses the identity its colour is carrying.
  const base = new THREE.Color(colour);
  base.offsetHSL(0, 0.2, -0.05);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, width, height);

  const random = mulberry32(hashString(key));

  if (style === 'banded' || style === 'swirled') {
    drawBands(ctx, width, height, base, random, style === 'swirled' ? 0.75 : 1);
  }
  if (style === 'mottled' || style === 'swirled') {
    drawBlobs(ctx, width, height, base, random, roughness);
  }
  if (style === 'swirled') {
    drawStreaks(ctx, width, height, base, random);
  }

  drawPolarShading(ctx, width, height);
  drawSpeckle(ctx, width, height, random);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

/** Latitude bands with wavy edges — a gas giant read at a glance. */
function drawBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  base: THREE.Color,
  random: () => number,
  strength: number,
) {
  const count = 7 + Math.floor(random() * 6);
  let y = 0;
  for (let i = 0; i < count && y < height; i += 1) {
    const band = (height / count) * (0.55 + random() * 0.95);
    const shade = base.clone();
    const delta = (random() - 0.45) * 0.5 * strength;
    shade.offsetHSL(delta * 0.03, delta * 0.1, delta * 0.3);

    ctx.fillStyle = `#${shade.getHexString()}`;
    ctx.globalAlpha = 0.55 * strength;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // A sine ripple along each edge stops the bands reading as printed stripes.
    const amplitude = band * (0.1 + random() * 0.28);
    const frequency = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    for (let x = 0; x <= width; x += 8) {
      ctx.lineTo(x, y + Math.sin((x / width) * Math.PI * 2 * frequency + phase) * amplitude);
    }
    for (let x = width; x >= 0; x -= 8) {
      ctx.lineTo(
        x,
        y + band + Math.sin((x / width) * Math.PI * 2 * frequency + phase + 1.4) * amplitude,
      );
    }
    ctx.closePath();
    ctx.fill();
    y += band;
  }
  ctx.globalAlpha = 1;
}

/** Soft overlapping discs — continents and weather on a rocky world. */
function drawBlobs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  base: THREE.Color,
  random: () => number,
  roughness: number,
) {
  for (let layer = 0; layer < 3; layer += 1) {
    const blobs = 30 - layer * 7;
    const radius = (64 - layer * 17) * (0.6 + roughness * 0.8);
    for (let i = 0; i < blobs; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const shade = base.clone();
      const delta = (random() - 0.5) * 0.85 * (0.5 + roughness);
      shade.offsetHSL(delta * 0.04, delta * 0.12, delta * 0.32);
      const hex = `#${shade.getHexString()}`;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, hex);
      gradient.addColorStop(1, hexToRgba(hex, 0));
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.46;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Long thin highlights that read as high cloud drawn out by rotation. */
function drawStreaks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  base: THREE.Color,
  random: () => number,
) {
  const light = base.clone();
  light.offsetHSL(0, -0.08, 0.24);
  ctx.strokeStyle = hexToRgba(`#${light.getHexString()}`, 0.3);
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i += 1) {
    const y = random() * height;
    const length = width * (0.12 + random() * 0.3);
    const x = random() * width;
    ctx.lineWidth = 1.5 + random() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.33,
      y - 5 + random() * 10,
      x + length * 0.66,
      y - 5 + random() * 10,
      x + length,
      y,
    );
    ctx.stroke();
  }
}

/** Darkens the poles so the sphere reads as a globe rather than a decal. */
function drawPolarShading(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  gradient.addColorStop(0.22, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.78, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** Fine per-pixel grain. One pass at build time; nothing at render time. */
function drawSpeckle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  random: () => number,
) {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (random() - 0.5) * 16;
    data[i] = clampByte(data[i] + noise);
    data[i + 1] = clampByte(data[i + 1] + noise);
    data[i + 2] = clampByte(data[i + 2] + noise);
  }
  ctx.putImageData(image, 0, 0);
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function hexToRgba(hex: string, alpha: number): string {
  const colour = new THREE.Color(hex);
  const r = Math.round(colour.r * 255);
  const g = Math.round(colour.g * 255);
  const b = Math.round(colour.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
