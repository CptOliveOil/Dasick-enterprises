'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Agent } from '@/types/domain';
import { agentStatusStyle } from '@/lib/agents/status';
import type { PlanetLayout } from './layout';
import type { QualityProfile } from './quality';
import { glowTexture, surfaceTexture } from './textures';

export interface PlanetProps {
  agent: Agent;
  layout: PlanetLayout;
  quality: QualityProfile;
  animate: boolean;
  selected: boolean;
  hovered: boolean;
  /**
   * How far this planet is pushed into the background, 0–1. Zero is full
   * attention; higher values are the planets that are not what you are
   * currently looking at.
   */
  dim: number;
  showLabel: boolean;
  activeTaskCount: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onPosition: (id: string, position: THREE.Vector3) => void;
}

/**
 * One agent, rendered as a planet.
 *
 * Everything visible is bound to real state: emissive strength comes from the
 * agent's status, the attention ring appears only while an approval is genuinely
 * outstanding, and an offline agent is dimmed rather than recoloured. The
 * geometry — where it orbits, how fast, which surface it wears — comes from the
 * display layout, which is presentation only.
 */
export function Planet({
  agent,
  layout,
  quality,
  animate,
  selected,
  hovered,
  dim,
  showLabel,
  activeTaskCount,
  onHover,
  onSelect,
  onPosition,
}: PlanetProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const attention = useRef<THREE.Mesh>(null);
  const scale = useRef(1);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  const visual = agent.visual;
  const style = agentStatusStyle(agent.status);
  const { radius } = layout;

  const surface = useMemo(
    () => surfaceTexture(visual.colour, visual.roughness, layout.surface, agent.id),
    [visual.colour, visual.roughness, layout.surface, agent.id],
  );
  const halo = useMemo(() => glowTexture(style.colour), [style.colour]);
  const bloom = useMemo(() => glowTexture(visual.atmosphere), [visual.atmosphere]);

  // Attention is a single number so every layer fades together: the planet, its
  // atmosphere, its bloom and its label all recede by the same amount.
  const attentionLevel = (1 - dim) * (style.dim ? 0.55 : 1);
  const emissive = style.glow * attentionLevel * (selected || hovered ? 1.35 : 1);

  useFrame((state, delta) => {
    if (!group.current) return;

    const t = animate ? state.clock.elapsedTime : 0;
    const theta = layout.angle + t * layout.speed;
    group.current.position.set(
      Math.cos(theta) * layout.orbit,
      Math.sin(theta * 1.3) * layout.orbit * layout.inclination * 0.35,
      Math.sin(theta) * layout.orbit,
    );

    if (body.current && animate) {
      // Working agents turn a little faster, but this is still a slow spin —
      // the difference reads as life, not as urgency.
      body.current.rotation.y += delta * layout.spin * (agent.status === 'working' ? 1.7 : 1);
    }

    // Selection and hover grow the planet, and the growth is eased rather than
    // snapped so nothing in the scene ever jumps.
    const target = selected ? 1.22 : hovered ? 1.09 : 1;
    scale.current = THREE.MathUtils.damp(scale.current, target, 4.5, delta);
    group.current.scale.setScalar(scale.current);

    if (attention.current) {
      const pulse = animate ? 1 + Math.sin(t * 0.9) * 0.07 : 1.04;
      attention.current.scale.setScalar(pulse);
    }

    group.current.getWorldPosition(worldPosition);
    onPosition(agent.id, worldPosition);
  });

  // Offline and disabled agents are the one case that stays genuinely
  // translucent — they are not fully there, and they should not look it.
  const bodyOpacity = style.dim ? 0.5 : 1;
  const shade = useMemo(() => {
    const level = style.dim ? 0.55 : 1 - dim * 0.8;
    return new THREE.Color(level, level, level);
  }, [style.dim, dim]);

  const labelOpacity = selected || hovered ? 1 : dim > 0.7 ? 0 : Math.max(0.3, 0.8 - dim * 0.7);

  return (
    <group ref={group}>
      {/* Tilt lives on its own group so the axis leans without tipping the
          rings, the halos or the label out of true. */}
      <group rotation={[layout.tilt, 0, layout.tilt * 0.4]}>
        <mesh
          ref={body}
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
          <sphereGeometry args={[radius, ...quality.sphereSegments]} />
          <meshStandardMaterial
            map={surface}
            // A grey multiplier over the texture, which already carries the
            // hue. Dimming by darkening rather than by transparency matters:
            // a half-transparent planet shows the starfield through itself and
            // stops reading as a solid world.
            color={shade}
            emissive={new THREE.Color(visual.colour)}
            emissiveIntensity={0.12 + emissive * 0.12}
            roughness={0.82}
            metalness={0.08}
            transparent
            opacity={bodyOpacity}
          />
        </mesh>

        {visual.ring && (
          // Three thin concentric bands rather than one flat disc: a ring
          // system has gaps in it, and the gaps are most of what sells it.
          <group rotation={[Math.PI / 2.3, 0, layout.ringTilt]}>
            {RING_BANDS.map((band) => (
              <mesh key={band.inner}>
                <ringGeometry args={[radius * band.inner, radius * band.outer, 96]} />
                <meshBasicMaterial
                  color={visual.atmosphere}
                  transparent
                  opacity={band.opacity * attentionLevel}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        )}
      </group>

      {/* Atmospheric rim: a slightly larger inverted shell, additively blended. */}
      {quality.atmospheres && (
        <mesh scale={1.14}>
          <sphereGeometry args={[radius, ...quality.sphereSegments]} />
          <meshBasicMaterial
            color={visual.atmosphere}
            transparent
            opacity={0.3 * attentionLevel}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Planet bloom — identity. */}
      <sprite scale={radius * 4.2}>
        <spriteMaterial
          map={bloom}
          transparent
          opacity={0.36 * attentionLevel}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* Status bloom — tighter and brighter, so "working" genuinely reads hotter. */}
      <sprite scale={radius * (2.2 + emissive * 0.9)}>
        <spriteMaterial
          map={halo}
          transparent
          opacity={0.26 * emissive}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {style.ring && (
        <mesh ref={attention} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.62, radius * 1.76, 64]} />
          <meshBasicMaterial
            color="#f59e0b"
            transparent
            opacity={0.72 * attentionLevel}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.95, radius * 2.02, 96]} />
          <meshBasicMaterial color="#e8ebf5" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {activeTaskCount > 0 && (
        <sprite position={[radius * 1.35, radius * 1.35, 0]} scale={0.36}>
          <spriteMaterial
            map={glowTexture('#38bdf8')}
            transparent
            opacity={0.85 * attentionLevel}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      )}

      {showLabel && labelOpacity > 0 && (
        <Html
          center
          // Clear of the planet, its atmosphere and its rings, so the name
          // never sits on top of the thing it is naming.
          position={[0, -(radius * 1.55 + 0.5), 0]}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none', opacity: labelOpacity, transition: 'opacity 260ms ease' }}
        >
          <div className="galaxy-label">
            <span className="galaxy-label-name">{agent.name}</span>
            <span className="galaxy-label-status" style={{ color: style.colour }}>
              {style.label}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Inner and outer edges as multiples of the planet radius, plus a gap. */
const RING_BANDS = [
  { inner: 1.35, outer: 1.62, opacity: 0.2 },
  { inner: 1.68, outer: 1.95, opacity: 0.3 },
  { inner: 2.02, outer: 2.16, opacity: 0.14 },
];
