'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Agent } from '@/types/domain';
import { agentStatusStyle } from '@/lib/agents/status';
import type { QualityProfile } from './quality';
import { glowTexture, surfaceTexture } from './textures';

export interface PlanetProps {
  agent: Agent;
  quality: QualityProfile;
  animate: boolean;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  activeTaskCount: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onPosition: (id: string, position: THREE.Vector3) => void;
}

/**
 * One agent, rendered as a planet.
 *
 * Everything visible here is bound to real state: the emissive strength comes
 * from the agent's status, the attention ring appears only when an approval is
 * outstanding, and a disabled agent is genuinely dimmed rather than recoloured.
 */
export function Planet({
  agent,
  quality,
  animate,
  selected,
  hovered,
  dimmed,
  activeTaskCount,
  onHover,
  onSelect,
  onPosition,
}: PlanetProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  const visual = agent.visual;
  const style = agentStatusStyle(agent.status);

  const surface = useMemo(
    () => surfaceTexture(visual.colour, visual.roughness),
    [visual.colour, visual.roughness],
  );
  const halo = useMemo(() => glowTexture(style.colour), [style.colour]);

  useFrame((state, delta) => {
    if (!group.current) return;

    const t = animate ? state.clock.elapsedTime : 0;
    const theta = visual.angle + t * visual.speed;
    group.current.position.set(
      Math.cos(theta) * visual.orbit,
      Math.sin(theta * 1.3) * visual.orbit * visual.inclination * 0.35,
      Math.sin(theta) * visual.orbit,
    );

    if (body.current && animate) {
      body.current.rotation.y += delta * (agent.status === 'working' ? 0.16 : 0.05);
    }

    if (ring.current) {
      // Slow amber attention ring — only while approval is genuinely pending.
      const pulse = animate ? 1 + Math.sin(t * 1.6) * 0.12 : 1.1;
      ring.current.scale.setScalar(pulse);
    }

    group.current.getWorldPosition(worldPosition);
    onPosition(agent.id, worldPosition);
  });

  const emissive = style.glow * (dimmed ? 0.25 : 1) * (selected || hovered ? 1.4 : 1);
  const opacity = style.dim ? 0.42 : dimmed ? 0.3 : 1;

  return (
    <group ref={group}>
      <mesh
        ref={body}
        castShadow={false}
        receiveShadow={false}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(agent.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          onHover(null);
          document.body.style.cursor = '';
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(agent.id);
        }}
      >
        <sphereGeometry args={[visual.radius, ...quality.sphereSegments]} />
        <meshStandardMaterial
          map={surface}
          color={visual.colour}
          emissive={new THREE.Color(style.colour)}
          emissiveIntensity={emissive * 0.32}
          roughness={0.72}
          metalness={0.08}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Atmospheric rim: a slightly larger inverted shell, additively blended. */}
      {quality.atmospheres && (
        <mesh scale={1.14}>
          <sphereGeometry args={[visual.radius, ...quality.sphereSegments]} />
          <meshBasicMaterial
            color={visual.atmosphere}
            transparent
            opacity={0.14 * (dimmed ? 0.4 : 1) * (style.dim ? 0.3 : 1)}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Bloom sprite. Scales with status so "working" genuinely reads brighter. */}
      <sprite scale={visual.radius * (3.4 + emissive * 0.8)}>
        <spriteMaterial
          map={halo}
          transparent
          opacity={0.5 * emissive * (dimmed ? 0.35 : 1)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {visual.ring && (
        <mesh rotation={[Math.PI / 2.35, 0, 0.3]}>
          <ringGeometry args={[visual.radius * 1.5, visual.radius * 2.2, 64]} />
          <meshBasicMaterial
            color={visual.atmosphere}
            transparent
            opacity={0.22 * (dimmed ? 0.35 : 1)}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {style.ring && (
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[visual.radius * 1.75, visual.radius * 1.92, 48]} />
          <meshBasicMaterial
            color="#f59e0b"
            transparent
            opacity={0.75}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[visual.radius * 2.1, visual.radius * 2.18, 64]} />
          <meshBasicMaterial color="#e8ebf5" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {activeTaskCount > 0 && (
        <sprite position={[visual.radius * 1.5, visual.radius * 1.5, 0]} scale={0.34}>
          <spriteMaterial
            map={glowTexture('#38bdf8')}
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      )}
    </group>
  );
}
