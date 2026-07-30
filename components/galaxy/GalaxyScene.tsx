'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Agent, Task } from '@/types/domain';
import type { LiveConnection } from '@/types/state';
import { CommandCore } from './CommandCore';
import { buildLayout } from './layout';
import { Planet } from './Planet';
import { Rockets } from './Rockets';
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
  /** When set, every agent outside the set is pushed into the background. */
  highlightIds: Set<string> | null;
  coreActive: boolean;
  view: ViewCommand;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onPositions: (positions: Map<string, THREE.Vector3>) => void;
}

/**
 * Camera elevation above the ecliptic, radians.
 *
 * Shallow angles squash the system into a thin band and waste the top and
 * bottom of the screen; straight down loses the sense of a solar system
 * entirely. Just over forty degrees keeps the orbits legibly separated while
 * still filling the frame.
 */
const ELEVATION = 0.74;
/** Fraction of the viewport the system fills at rest. */
const FILL = 0.94;
const FOV = 40;
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export function GalaxyScene(props: GalaxySceneProps) {
  return (
    <Canvas
      dpr={props.quality.dpr}
      gl={{
        antialias: props.quality.tier !== 'low',
        alpha: true,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [0, 20, 30], fov: FOV, near: 0.1, far: 320 }}
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
  const desiredPosition = useRef(new THREE.Vector3(0, 20, 30));
  const transitioning = useRef(false);
  /** While set, the camera keeps this planet centred as it orbits. */
  const followId = useRef<string | null>(null);
  const followedAt = useRef(new THREE.Vector3());
  const framed = useRef(false);
  /** True once the operator has moved the camera themselves. */
  const claimed = useRef(false);
  /** The last view command actually carried out. */
  const appliedNonce = useRef(-1);
  const drift = useMemo(() => new THREE.Vector3(), []);
  const { camera, size } = useThree();

  const layout = useMemo(() => buildLayout(agents), [agents]);

  const colours = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.visual.colour] as const)),
    [agents],
  );

  const activeTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.agent_id) continue;
      if (!['running', 'queued', 'approval', 'waiting'].includes(task.status)) continue;
      counts.set(task.agent_id, (counts.get(task.agent_id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

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

  /**
   * The resting camera, computed from the system's actual size and the shape of
   * the viewport rather than being a fixed vector. This is what fills the
   * screen: a hard-coded position is only ever right for one system size at one
   * window size, and wrong the rest of the time.
   *
   * Seen from above the ecliptic, a disc does not project to a centred ellipse.
   * The near edge is closer to the camera, so it looms larger and reaches
   * further down the screen than the far edge reaches up. Framing as though it
   * were symmetric is what pushed the outermost orbit off the bottom of the
   * canvas, so the aim point is nudged towards the near edge until the two
   * reaches match, and the distance is then solved against that. Both feed each
   * other, hence the short fixed-point loop rather than a closed form.
   */
  const restingView = useCallback(() => {
    const halfVertical = Math.tan((FOV * Math.PI) / 360);
    const halfHorizontal = halfVertical * (size.width / Math.max(1, size.height));
    // systemRadius already includes the outermost planet, so the margin here is
    // only breathing room, not a second allowance for the planet's own size.
    const radius = layout.systemRadius + 0.6;
    const cosE = Math.cos(ELEVATION);
    const sinE = Math.sin(ELEVATION);

    let distance = radius / (halfHorizontal * FILL);
    let shift = 0;
    for (let i = 0; i < 8; i += 1) {
      shift = Math.min(
        radius * 0.45,
        ((radius * radius - shift * shift) * cosE) / Math.max(1, distance),
      );
      const reach = radius - shift;
      // Moving the aim point towards the near edge also pushes the left and
      // right extremes further away, so the width requirement relaxes by the
      // same amount the height requirement was bought with.
      const byWidth = radius / (halfHorizontal * FILL) - shift * cosE;
      const byHeight = reach * cosE + (reach * sinE) / (halfVertical * FILL);
      distance = Math.max(byWidth, byHeight);
    }

    const target = new THREE.Vector3(0, 0, shift);
    const position = new THREE.Vector3(0, sinE, cosE).multiplyScalar(distance).add(target);
    return { position, target, distance };
  }, [layout.systemRadius, size.width, size.height]);

  // First frame and every resize: settle to a framing that fills the screen.
  // After the first, this is a gentle move rather than a jump.
  useEffect(() => {
    if (layout.planets.size === 0) return;
    const resting = restingView();
    if (!framed.current) {
      framed.current = true;
      camera.position.copy(resting.position);
      camera.lookAt(resting.target);
    }
    // Once the operator has taken the camera somewhere, a window resize is not
    // a reason to take it back.
    if (followId.current || claimed.current) return;
    desiredPosition.current.copy(resting.position);
    desiredTarget.current.copy(resting.target);
    transitioning.current = true;
  }, [restingView, camera, layout.planets.size]);

  // Camera intents arrive as commands rather than direct mutations, so the
  // operator can always drag away from a focus without fighting the animation.
  //
  // Acting on the nonce rather than the object matters: the workforce snapshot
  // refreshes every few seconds, and without this the camera would re-fly to
  // the last focus on every poll.
  useEffect(() => {
    if (view.kind === 'none' || view.nonce === appliedNonce.current) return;
    if (view.kind === 'reset' || view.kind === 'fit') {
      appliedNonce.current = view.nonce;
      claimed.current = false;
      followId.current = null;
      const resting = restingView();
      desiredPosition.current.copy(resting.position);
      desiredTarget.current.copy(resting.target);
      transitioning.current = true;
      return;
    }
    if (view.kind === 'focus' && view.agentId) {
      const position = positions.get(view.agentId);
      const planet = layout.planets.get(view.agentId);
      // Nothing has rendered yet, so nothing is known about where to fly. The
      // nonce is left unapplied and the command is honoured on the next pass.
      if (!position || !planet) return;
      appliedNonce.current = view.nonce;
      claimed.current = false;
      followId.current = view.agentId;
      followedAt.current.copy(position);
      desiredTarget.current.copy(position);
      // A focus is a push-in, not a close-up. Most of the resting distance is
      // kept so the planet comes unmistakably to the centre while the rest of
      // the system stays in frame around it. Losing the system is disorienting,
      // the dimming already says which planet is the subject, and the inspector
      // beside the galaxy carries the detail a close-up would be for.
      const distance = Math.max(planet.radius * 11, restingView().distance * 0.78);
      const offset = position
        .clone()
        .setY(0)
        .normalize()
        .applyAxisAngle(UP, Math.PI * 0.3)
        .multiplyScalar(Math.cos(ELEVATION) * distance);
      desiredPosition.current
        .copy(position)
        .add(offset)
        .add(new THREE.Vector3(0, Math.sin(ELEVATION) * distance, 0));
      transitioning.current = true;
    }
  }, [view, layout.planets, positions, restingView]);

  // Deselecting releases the camera where it is. It does not fly home — the
  // operator did not ask it to move.
  useEffect(() => {
    if (!selectedId) followId.current = null;
  }, [selectedId]);

  useFrame((_, delta) => {
    if (!controls.current) return;

    // A focused planet keeps orbiting. Both the camera and its target are
    // shifted by the same amount, so the planet stays centred without the
    // operator's own angle or zoom being overridden.
    if (followId.current) {
      const current = positions.get(followId.current);
      if (current) {
        drift.subVectors(current, followedAt.current);
        followedAt.current.copy(current);
        desiredTarget.current.add(drift);
        desiredPosition.current.add(drift);
        if (!transitioning.current) {
          camera.position.add(drift);
          controls.current.target.add(drift);
        }
      }
    }

    if (!transitioning.current) return;

    // Exponential damping rather than a fixed step: the move is frame-rate
    // independent, starts gently and lands without a stop.
    const k = 1 - Math.exp(-delta * 1.5);
    camera.position.lerp(desiredPosition.current, k);
    controls.current.target.lerp(desiredTarget.current, k);
    controls.current.update();
    if (
      camera.position.distanceTo(desiredPosition.current) < 0.04 &&
      controls.current.target.distanceTo(desiredTarget.current) < 0.04
    ) {
      transitioning.current = false;
    }
  });

  return (
    <>
      {/* Deliberately dim ambient: the command core should be doing the lighting. */}
      <ambientLight intensity={0.11} />
      <hemisphereLight intensity={0.1} color="#8fb8ff" groundColor="#050a16" />

      <Starfield count={quality.starCount} animate={animate} />
      {quality.orbitRings && <OrbitRings radii={layout.rings} />}

      <CommandCore quality={quality} animate={animate} active={coreActive} />

      {agents.map((agent) => {
        const planet = layout.planets.get(agent.id);
        if (!planet) return null;
        return (
          <Planet
            key={agent.id}
            agent={agent}
            layout={planet}
            quality={quality}
            animate={animate}
            selected={selectedId === agent.id}
            hovered={hoveredId === agent.id}
            dim={dimLevel(agent.id, selectedId, hoveredId, highlightIds)}
            showLabel={quality.labels}
            activeTaskCount={activeTaskCounts.get(agent.id) ?? 0}
            onHover={onHover}
            onSelect={onSelect}
            onPosition={handlePosition}
          />
        );
      })}

      <Rockets
        connections={connections}
        positions={positions}
        colours={colours}
        animate={animate}
        maxConcurrent={quality.maxRockets}
        trailLength={quality.rocketTrail}
      />

      <OrbitControls
        ref={controls}
        enablePan
        enableZoom
        enableRotate
        enableDamping
        // Heavier damping than before: dragging the system feels weighted
        // rather than twitchy, and it coasts to a stop instead of stopping.
        dampingFactor={0.045}
        rotateSpeed={0.34}
        panSpeed={0.5}
        zoomSpeed={0.55}
        minDistance={4}
        maxDistance={90}
        // Keep the operator above the ecliptic — an under-the-floor view of a
        // solar system is disorienting and never useful.
        minPolarAngle={0.22}
        maxPolarAngle={Math.PI / 2.05}
        onStart={() => {
          transitioning.current = false;
          claimed.current = true;
        }}
      />
    </>
  );
}

/**
 * How far back a planet sits, 0–1.
 *
 * Three separate reasons a planet might recede, in priority order: it is
 * outside an explicit highlight set (a mission or a business filter), or
 * something else is selected, or something else is hovered. Each is a different
 * strength, because "not in this mission" is a stronger statement than "not the
 * one your cursor happens to be over".
 */
function dimLevel(
  id: string,
  selectedId: string | null,
  hoveredId: string | null,
  highlightIds: Set<string> | null,
): number {
  if (highlightIds && !highlightIds.has(id)) return 0.78;
  if (selectedId && selectedId !== id) return 0.6;
  if (!selectedId && hoveredId && hoveredId !== id) return 0.2;
  return 0;
}
