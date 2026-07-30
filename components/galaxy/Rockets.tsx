'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LiveConnection } from '@/types/state';
import {
  FLIGHT_SECONDS,
  hasExpired,
  inFlight,
  MAX_QUEUED,
  readyToLaunch,
  worthFlying,
} from './flights';
import { glowTexture } from './textures';

/**
 * Handoff spacecraft.
 *
 * When one agent hands work to another, a small craft flies from the sending
 * planet to the receiving one and disappears on arrival. Every flight comes
 * from a real handoff activity log — `connections` is built server-side from
 * logs of kind `handoff` — so the galaxy never shows work moving that did not
 * move. There is no idle traffic and no decorative flight.
 *
 * Flights are queued rather than fired all at once: a burst of six handoffs
 * arriving together would be noise, so they leave one at a time, a beat apart,
 * with a hard ceiling on how many are in the air.
 */

interface Flight {
  key: string;
  fromAgentId: string;
  toAgentId: string;
  colour: string;
  /** Scene clock time at launch. */
  startedAt: number;
}

interface Queued {
  connection: LiveConnection;
  queuedAt: number;
}

export function Rockets({
  connections,
  positions,
  colours,
  animate,
  maxConcurrent,
  trailLength,
}: {
  connections: LiveConnection[];
  positions: Map<string, THREE.Vector3>;
  /** Agent id to planet colour — the craft carries the sender's light. */
  colours: Map<string, string>;
  animate: boolean;
  maxConcurrent: number;
  trailLength: number;
}) {
  const seen = useRef(new Set<string>());
  const queue = useRef<Queued[]>([]);
  const active = useRef<Flight[]>([]);
  const lastLaunch = useRef(Number.NEGATIVE_INFINITY);
  const [, redraw] = useState(0);

  useEffect(() => {
    if (!animate) return;
    for (const connection of connections) {
      if (seen.current.has(connection.id)) continue;
      seen.current.add(connection.id);
      if (!worthFlying(connection.createdAt, Date.now())) continue;
      queue.current.push({ connection, queuedAt: Date.now() });
    }
    if (queue.current.length > MAX_QUEUED) {
      queue.current = queue.current.slice(-MAX_QUEUED);
    }
  }, [connections, animate]);

  useFrame((state) => {
    if (!animate) return;
    const now = state.clock.elapsedTime;
    let changed = false;

    const still = active.current.filter((flight) => inFlight(flight.startedAt, now));
    if (still.length !== active.current.length) {
      active.current = still;
      changed = true;
    }

    // Drop anything whose planets never turned up — a deleted agent must not
    // wedge the queue behind it.
    const patient = queue.current.filter((item) => !hasExpired(item.queuedAt, Date.now()));
    if (patient.length !== queue.current.length) queue.current = patient;

    if (
      readyToLaunch({
        queued: queue.current.length,
        active: active.current.length,
        maxConcurrent,
        now,
        lastLaunchAt: lastLaunch.current,
      })
    ) {
      const next = queue.current[0];
      const { fromAgentId, toAgentId, id } = next.connection;
      if (positions.has(fromAgentId) && positions.has(toAgentId)) {
        queue.current.shift();
        active.current.push({
          key: id,
          fromAgentId,
          toAgentId,
          colour: colours.get(fromAgentId) ?? '#7dd3fc',
          startedAt: now,
        });
        lastLaunch.current = now;
        changed = true;
      }
    }

    // Only a launch or an arrival changes what is mounted — a couple of renders
    // per handoff, never one per frame.
    if (changed) redraw((n) => n + 1);
  });

  if (!animate) return null;

  return (
    <group>
      {active.current.map((flight) => (
        <Rocket
          key={`${flight.key}:${flight.startedAt}`}
          flight={flight}
          positions={positions}
          trailLength={trailLength}
        />
      ))}
    </group>
  );
}

function Rocket({
  flight,
  positions,
  trailLength,
}: {
  flight: Flight;
  positions: Map<string, THREE.Vector3>;
  trailLength: number;
}) {
  const group = useRef<THREE.Group>(null);
  const craft = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Group>(null);
  const launchPoint = useRef<THREE.Vector3 | null>(null);

  const halo = useMemo(() => glowTexture(flight.colour), [flight.colour]);
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ),
    [],
  );
  const head = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  // The flight path, drawn faintly so the route is legible before the craft
  // reaches it. Built once; only its points and opacity change.
  const path = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(flight.colour),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return new THREE.Line(new THREE.BufferGeometry(), material);
  }, [flight.colour]);

  useEffect(() => {
    return () => {
      path.geometry.dispose();
      (path.material as THREE.Material).dispose();
    };
  }, [path]);

  useFrame((state) => {
    const from = positions.get(flight.fromAgentId);
    const to = positions.get(flight.toAgentId);
    if (!to || !group.current || !craft.current) return;

    // The launch point is captured once, so the craft leaves from where the
    // sender actually was. The destination is read live, so it lands on the
    // receiver rather than where the receiver used to be.
    if (!launchPoint.current) launchPoint.current = (from ?? to).clone();
    const start = launchPoint.current;

    const linear = THREE.MathUtils.clamp(
      (state.clock.elapsedTime - flight.startedAt) / FLIGHT_SECONDS,
      0,
      1,
    );
    // Ease in and out: the craft pulls away, cruises, and settles rather than
    // starting and stopping at full speed.
    const progress = linear * linear * (3 - 2 * linear);

    const span = start.distanceTo(to);
    curve.v0.copy(start);
    curve.v2.copy(to);
    curve.v1
      .copy(start)
      .add(to)
      .multiplyScalar(0.5)
      // Lift above the ecliptic and bow away from the core, so the path reads
      // as travel between two worlds rather than a chord through the middle.
      .add(scratch.set(0, span * 0.26 + 1.1, 0));
    curve.v1.add(
      scratch.copy(curve.v1).setY(0).normalize().multiplyScalar(span * 0.1),
    );

    curve.getPoint(progress, head);
    curve.getPoint(Math.min(1, progress + 0.012), ahead);
    craft.current.position.copy(head);
    if (ahead.distanceToSquared(head) > 1e-8) craft.current.lookAt(ahead);

    const fade =
      linear < 0.1 ? linear / 0.1 : linear > 0.88 ? Math.max(0, (1 - linear) / 0.12) : 1;

    craft.current.traverse((object) => {
      const material = (object as THREE.Mesh | THREE.Sprite).material as
        | THREE.Material
        | undefined;
      if (!material || typeof object.userData.baseOpacity !== 'number') return;
      material.opacity = object.userData.baseOpacity * fade;
    });

    if (trail.current) {
      trail.current.children.forEach((child, index) => {
        if (!(child instanceof THREE.Sprite)) return;
        const behind = Math.max(0, progress - (index + 1) * 0.014);
        curve.getPoint(behind, child.position);
        const falloff = 1 - index / Math.max(1, trailLength);
        child.material.opacity = fade * falloff * 0.6;
        child.scale.setScalar(0.75 * falloff + 0.18);
      });
    }

    path.geometry.setFromPoints(curve.getPoints(40));
    (path.material as THREE.LineBasicMaterial).opacity = 0.34 * fade;
  });

  return (
    <group ref={group}>
      <primitive object={path} />

      <group ref={trail}>
        {Array.from({ length: trailLength }, (_, i) => (
          <sprite key={i} scale={0.6}>
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

      {/*
        The craft itself, modelled nose-forward along +Z so `lookAt` aims it.

        Deliberately self-illuminated rather than metallic. The only real light
        in this scene is the command core, and a polished metal hull with no
        environment to reflect renders as a black silhouette against black
        space — invisible exactly when it matters. Low metalness plus a strong
        emissive in the sender's colour keeps it legible wherever it goes, and
        reads as a powered craft rather than a lit model.

        Sized to be seen rather than to scale. At the resting framing the system
        spans roughly a world unit every thirty pixels, so this is a craft about
        a hundred pixels nose to tail and a quarter of that across. Slender
        enough at four to one to read as a vessel rather than a toy, and large
        enough to follow with the eye across a screen full of planets — which is
        the whole point of drawing it.
      */}
      <group ref={craft} scale={2.1}>
        {/* Drive glow around the whole hull: what catches the eye first. */}
        <sprite scale={2.2} userData={{ baseOpacity: 0.45 }}>
          <spriteMaterial
            map={halo}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>

        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.62]}
          userData={{ baseOpacity: 1 }}
        >
          <coneGeometry args={[0.19, 0.62, 16]} />
          <meshStandardMaterial
            color="#f6f8ff"
            emissive={new THREE.Color('#e2eaff')}
            emissiveIntensity={0.9}
            roughness={0.4}
            metalness={0.1}
            transparent
          />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]} userData={{ baseOpacity: 1 }}>
          <cylinderGeometry args={[0.19, 0.17, 0.9, 16]} />
          <meshStandardMaterial
            color="#d3dcf2"
            emissive={new THREE.Color(flight.colour)}
            emissiveIntensity={0.8}
            roughness={0.45}
            metalness={0.1}
            transparent
          />
        </mesh>

        {/* A lit collar: reads as a running light at any distance. */}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.06]}
          userData={{ baseOpacity: 1 }}
        >
          <torusGeometry args={[0.22, 0.045, 8, 24]} />
          <meshBasicMaterial color={flight.colour} transparent depthWrite={false} />
        </mesh>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, -0.58]}
          userData={{ baseOpacity: 1 }}
        >
          <coneGeometry args={[0.17, 0.26, 16]} />
          <meshStandardMaterial
            color="#94a6c9"
            emissive={new THREE.Color(flight.colour)}
            emissiveIntensity={0.5}
            roughness={0.5}
            metalness={0.1}
            transparent
          />
        </mesh>

        {/* Exhaust bloom, trailing the craft. */}
        <sprite position={[0, 0, -0.9]} scale={1.15} userData={{ baseOpacity: 1 }}>
          <spriteMaterial
            map={halo}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
    </group>
  );
}
