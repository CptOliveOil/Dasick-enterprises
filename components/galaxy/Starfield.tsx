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
      // The inner edge sits well outside the outermost orbit.
      const radius = 54 + Math.random() * 46;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const roll = Math.random();
      const colour = roll > 0.93 ? warm : roll > 0.86 ? cool : plain;
      const brightness = 0.45 + Math.random() * 0.55;
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
    // Barely there: enough that the background is not a photograph, slow enough
    // that you never catch it moving.
    if (points.current && animate) points.current.rotation.y += delta * 0.0016;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.5}
        sizeAttenuation
        vertexColors
        transparent
        opacity={1}
        depthWrite={false}
      />
    </points>
  );
}

/** Faint orbit paths. Static geometry, never animated. */
export function OrbitRings({ radii }: { radii: number[] }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {radii.map((radius) => (
        <mesh key={radius}>
          <ringGeometry args={[radius - 0.014, radius + 0.014, 160]} />
          <meshBasicMaterial
            color="#4a5c8f"
            transparent
            // Quieter than before: with fewer, wider-spaced orbits the rings
            // only need to suggest the structure, not draw attention to it.
            opacity={0.3}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
