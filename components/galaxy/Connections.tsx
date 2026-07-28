'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LiveConnection } from '@/types/state';
import { glowTexture } from './textures';

const LIFETIME_MS = 45_000;

/**
 * Animated handoffs between planets.
 *
 * A beam is drawn only while a real handoff activity log is recent, and it
 * fades out as that log ages — so the interface never shows work moving that
 * did not move.
 */
export function Connections({
  connections,
  positions,
  particles,
  animate,
}: {
  connections: LiveConnection[];
  positions: Map<string, THREE.Vector3>;
  particles: number;
  animate: boolean;
}) {
  return (
    <group>
      {connections.map((connection) => (
        <Beam
          key={connection.id}
          connection={connection}
          positions={positions}
          particles={particles}
          animate={animate}
        />
      ))}
    </group>
  );
}

function Beam({
  connection,
  positions,
  particles,
  animate,
}: {
  connection: LiveConnection;
  positions: Map<string, THREE.Vector3>;
  particles: number;
  animate: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const halo = useMemo(() => glowTexture('#7dd3fc'), []);
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ),
    [],
  );

  // The line object is built once; only its geometry points and opacity change.
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, []);

  useFrame((state) => {
    const from = positions.get(connection.fromAgentId);
    const to = positions.get(connection.toAgentId);
    if (!from || !to || !group.current) return;

    const age = Date.now() - new Date(connection.createdAt).getTime();
    const fade = Math.max(0, 1 - age / LIFETIME_MS);
    if (fade <= 0) {
      group.current.visible = false;
      line.visible = false;
      return;
    }
    group.current.visible = true;
    line.visible = true;

    // Arc the beam outward from the plane so it reads as travel, not a chord.
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y += from.distanceTo(to) * 0.22 + 1.2;

    curve.v0.copy(from);
    curve.v1.copy(mid);
    curve.v2.copy(to);
    line.geometry.setFromPoints(curve.getPoints(48));
    (line.material as THREE.LineBasicMaterial).opacity = 0.34 * fade;

    const t = animate ? state.clock.elapsedTime : 0;
    group.current.children.forEach((child, index) => {
      if (!(child instanceof THREE.Sprite)) return;
      const offset = index / Math.max(1, particles);
      const progress = (t * 0.55 + offset) % 1;
      curve.getPoint(progress, child.position);
      const spriteMaterial = child.material as THREE.SpriteMaterial;
      // Fade each particle in and out across its travel so the trail has a head.
      spriteMaterial.opacity = fade * Math.sin(progress * Math.PI) * 0.9;
    });
  });

  return (
    <group>
      <primitive object={line} />
      <group ref={group}>
        {Array.from({ length: particles }, (_, i) => (
          <sprite key={i} scale={0.42}>
            <spriteMaterial
              map={halo}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}
