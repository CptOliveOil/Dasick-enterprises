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
      {/*
        decay 1 rather than the physical 2: the outer orbits sit four times
        further out than the inner ones, and a square falloff leaves them black.
      */}
      <pointLight intensity={26} distance={95} decay={1} color="#ffd8a0" />
      <mesh ref={core}>
        <sphereGeometry args={[1.05, ...quality.sphereSegments]} />
        <meshBasicMaterial color="#fff4d6" />
      </mesh>
      {[1.18, 1.42, 1.75].map((scale, i) => (
        <mesh key={scale} scale={scale}>
          <sphereGeometry args={[1.05, ...quality.sphereSegments]} />
          <meshBasicMaterial
            color={i === 0 ? '#ffcf7a' : i === 1 ? '#f5a524' : '#e2761b'}
            transparent
            opacity={0.3 - i * 0.08}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      <sprite ref={corona} scale={6.4}>
        <spriteMaterial
          map={halo}
          transparent
          opacity={active ? 0.95 : 0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite scale={13}>
        <spriteMaterial
          map={halo}
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
