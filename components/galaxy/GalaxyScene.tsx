'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Agent, Task } from '@/types/domain';
import type { LiveConnection } from '@/types/state';
import { CommandCore } from './CommandCore';
import { Connections } from './Connections';
import { Planet } from './Planet';
import { OrbitRings, Starfield } from './Starfield';
import type { QualityProfile } from './quality';

export interface ViewCommand {
  kind: 'reset' | 'fit' | 'focus' | 'none';
  agentId?: string;
  /** Bumped by the caller to re-trigger the same command. */
  nonce: number;
}

export interface GalaxySceneProps {
  agents: Agent[];
  tasks: Task[];
  connections: LiveConnection[];
  quality: QualityProfile;
  animate: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  /** When set, every agent outside the set is dimmed. */
  highlightIds: Set<string> | null;
  coreActive: boolean;
  view: ViewCommand;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onPositions: (positions: Map<string, THREE.Vector3>) => void;
}

const DEFAULT_POSITION = new THREE.Vector3(0, 12.5, 21);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

export function GalaxyScene(props: GalaxySceneProps) {
  return (
    <Canvas
      dpr={props.quality.dpr}
      gl={{ antialias: props.quality.tier !== 'low', alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: DEFAULT_POSITION.toArray(), fov: 42, near: 0.1, far: 220 }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}

function SceneContents({
  agents,
  tasks,
  connections,
  quality,
  animate,
  selectedId,
  hoveredId,
  highlightIds,
  coreActive,
  view,
  onSelect,
  onHover,
  onPositions,
}: GalaxySceneProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const positions = useMemo(() => new Map<string, THREE.Vector3>(), []);
  const desiredTarget = useRef(DEFAULT_TARGET.clone());
  const desiredPosition = useRef(DEFAULT_POSITION.clone());
  const transitioning = useRef(false);
  const { camera } = useThree();

  const activeTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.agent_id) continue;
      if (!['running', 'queued', 'approval', 'waiting'].includes(task.status)) continue;
      counts.set(task.agent_id, (counts.get(task.agent_id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const orbitRadii = useMemo(
    () => [...new Set(agents.map((a) => Number(a.visual.orbit.toFixed(2))))].sort((a, b) => a - b),
    [agents],
  );

  const handlePosition = useCallback(
    (id: string, position: THREE.Vector3) => {
      const existing = positions.get(id);
      if (existing) existing.copy(position);
      else positions.set(id, position.clone());
    },
    [positions],
  );

  useEffect(() => {
    onPositions(positions);
  }, [onPositions, positions]);

  // Camera intents arrive as commands rather than direct mutations, so the
  // operator can always drag away from a focus without fighting the animation.
  useEffect(() => {
    if (view.kind === 'none') return;
    if (view.kind === 'reset') {
      desiredPosition.current.copy(DEFAULT_POSITION);
      desiredTarget.current.copy(DEFAULT_TARGET);
      transitioning.current = true;
      return;
    }
    if (view.kind === 'fit') {
      const furthest = agents.reduce((max, a) => Math.max(max, a.visual.orbit), 6);
      desiredPosition.current.set(0, furthest * 1.1, furthest * 1.85);
      desiredTarget.current.copy(DEFAULT_TARGET);
      transitioning.current = true;
      return;
    }
    if (view.kind === 'focus' && view.agentId) {
      const position = positions.get(view.agentId);
      const agent = agents.find((a) => a.id === view.agentId);
      if (!position || !agent) return;
      desiredTarget.current.copy(position);
      const offset = position.clone().normalize().multiplyScalar(agent.visual.radius * 6 + 3);
      desiredPosition.current.copy(position).add(offset).add(new THREE.Vector3(0, 2.4, 0));
      transitioning.current = true;
    }
  }, [view, agents, positions]);

  useFrame((_, delta) => {
    if (!transitioning.current || !controls.current) return;
    const lerp = Math.min(1, delta * 3.2);
    camera.position.lerp(desiredPosition.current, lerp);
    controls.current.target.lerp(desiredTarget.current, lerp);
    controls.current.update();
    if (
      camera.position.distanceTo(desiredPosition.current) < 0.05 &&
      controls.current.target.distanceTo(desiredTarget.current) < 0.05
    ) {
      transitioning.current = false;
    }
  });

  return (
    <>
      <ambientLight intensity={0.32} />
      <hemisphereLight intensity={0.18} color="#8fb8ff" groundColor="#0a0f1e" />

      <Starfield count={quality.starCount} animate={animate} />
      {quality.orbitRings && <OrbitRings radii={orbitRadii} />}

      <CommandCore quality={quality} animate={animate} active={coreActive} />

      {agents.map((agent) => (
        <Planet
          key={agent.id}
          agent={agent}
          quality={quality}
          animate={animate}
          selected={selectedId === agent.id}
          hovered={hoveredId === agent.id}
          dimmed={highlightIds ? !highlightIds.has(agent.id) : false}
          activeTaskCount={activeTaskCounts.get(agent.id) ?? 0}
          onHover={onHover}
          onSelect={onSelect}
          onPosition={handlePosition}
        />
      ))}

      <Connections
        connections={connections}
        positions={positions}
        particles={quality.beamParticles}
        animate={animate}
      />

      <OrbitControls
        ref={controls}
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        panSpeed={0.7}
        zoomSpeed={0.8}
        minDistance={4}
        maxDistance={70}
        // Keep the operator above the ecliptic — an under-the-floor view of a
        // solar system is disorienting and never useful.
        minPolarAngle={0.22}
        maxPolarAngle={Math.PI / 2.05}
        onStart={() => {
          transitioning.current = false;
        }}
      />
    </>
  );
}
