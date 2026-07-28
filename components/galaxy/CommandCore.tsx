'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { glowTexture } from './textures';
import type { QualityProfile } from './quality';

/**
 * The star at the centre. This is where operator instructions enter the system,
 * so it pulses when a command is being processed and otherwise breathes slowly.
 */
export function CommandCore({
  quality,
  animate,
  active,
}: {
  quality: QualityProfile;
  animate: boolean;
  active: boolean;
}) {
  const core = useRef<THREE.Mesh>(null);
  const corona = useRef<THREE.Sprite>(null);
  const halo = useMemo(() => glowTexture('#f5a524'), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (core.current && animate) core.current.rotation.y += delta * 0.06;
    if (corona.current) {
      const base = active ? 7.6 : 6.4;
      const pulse = animate ? Math.sin(t * (active ? 3.2 : 1.1)) * (active ? 0.65 : 0.18) : 0;
      corona.current.scale.setScalar(base + pulse);
    }
  });

  return (
    <group>
      <pointLight intensity={140} distance={70} decay={2} color="#ffd08a" />
      <mesh ref={core}>
        <sphereGeometry args={[1.15, ...quality.sphereSegments]} />
        <meshBasicMaterial color="#ffcf7a" />
      </mesh>
      <mesh scale={1.22}>
        <sphereGeometry args={[1.15, ...quality.sphereSegments]} />
        <meshBasicMaterial
          color="#f5a524"
          transparent
          opacity={0.28}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <sprite ref={corona} scale={6.4}>
        <spriteMaterial
          map={halo}
          transparent
          opacity={active ? 0.85 : 0.62}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
