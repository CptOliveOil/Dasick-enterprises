'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Background stars. Static geometry, one draw call, rotated imperceptibly slowly. */
export function Starfield({ count, animate }: { count: number; animate: boolean }) {
  const points = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    const warm = new THREE.Color('#ffe6c4');
    const cool = new THREE.Color('#b8ccff');
    const plain = new THREE.Color('#e6ecff');

    for (let i = 0; i < count; i += 1) {
      // Shell distribution keeps stars behind the planets, never inside them.
      const radius = 42 + Math.random() * 46;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const roll = Math.random();
      const colour = roll > 0.93 ? warm : roll > 0.86 ? cool : plain;
      const brightness = 0.35 + Math.random() * 0.65;
      colours[i * 3] = colour.r * brightness;
      colours[i * 3 + 1] = colour.g * brightness;
      colours[i * 3 + 2] = colour.b * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return geo;
  }, [count]);

  useFrame((_, delta) => {
    if (points.current && animate) points.current.rotation.y += delta * 0.004;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.32}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

/** Faint orbit paths. Drawn once, never animated. */
export function OrbitRings({ radii }: { radii: number[] }) {
  const geometries = useMemo(
    () =>
      radii.map((radius) => {
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
        return new THREE.BufferGeometry().setFromPoints(
          curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0, p.y)),
        );
      }),
    [radii],
  );

  return (
    <group>
      {geometries.map((geometry, i) => (
        <lineLoop key={i} geometry={geometry}>
          <lineBasicMaterial color="#2a3350" transparent opacity={0.35} depthWrite={false} />
        </lineLoop>
      ))}
    </group>
  );
}
