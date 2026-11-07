// Static cell and moving objects for the 3D view (mm, z up).

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping } from 'three';
import type { SignalId } from '../model/cell';
import { LAYOUT, type ConveyorLayout, type Point2 } from '../model/layout';
import { signalValue } from '../model/messages';
import { useTwinStore } from '../state/store';
import { frameTime, robotAt } from './frame';

const { bounds, board, part, marker } = LAYOUT;
const TABLE_THICKNESS = 30;
/** Nominal belt speed for the stripe animation (the demo run takes 3.5 s). */
const BELT_TRAVEL_MS = 3500;

function stripeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#23292f';
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = '#3b444d';
  ctx.fillRect(0, 0, 10, 8);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

function Conveyor({ id, layout }: { id: SignalId; layout: ConveyorLayout }) {
  const dx = layout.to.x - layout.from.x;
  const dy = layout.to.y - layout.from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const tex = useMemo(() => {
    const t = stripeTexture();
    t.repeat.set(length / 60, 1);
    return t;
  }, [length]);

  useFrame((_, delta) => {
    const running = signalValue(useTwinStore.getState().io, id) === true;
    // One texture period is 60 mm; the belt runs its length in BELT_TRAVEL_MS.
    if (running) tex.offset.x -= (delta * 1000 * length) / BELT_TRAVEL_MS / 60;
  });

  const cx = (layout.from.x + layout.to.x) / 2;
  const cy = (layout.from.y + layout.to.y) / 2;
  return (
    <group position={[cx, cy, 0]} rotation-z={angle}>
      <mesh position={[0, 0, (layout.height - 6) / 2]}>
        <boxGeometry args={[length + 40, layout.width + 20, layout.height - 6]} />
        <meshStandardMaterial color="#5c6670" />
      </mesh>
      <mesh position={[0, 0, layout.height - 3]}>
        <boxGeometry args={[length, layout.width, 6]} />
        <meshStandardMaterial map={tex} />
      </mesh>
    </group>
  );
}

function Sensor({ id, at }: { id: SignalId; at: Point2 }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const on = signalValue(useTwinStore.getState().io, id) === true;
    mat.current?.emissive.set(on ? '#3fb950' : '#000000');
    mat.current?.color.set(on ? '#3fb950' : '#39424c');
  });
  return (
    <mesh position={[at.x, at.y, 60]}>
      <boxGeometry args={[30, 24, 120]} />
      <meshStandardMaterial ref={mat} color="#39424c" />
    </mesh>
  );
}

function Pad({ at, size, height, color }: { at: Point2 & { z?: number }; size: number; height: number; color: string }) {
  return (
    <mesh position={[at.x, at.y, (at.z ?? 0) + height / 2]}>
      <boxGeometry args={[size, size, height]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function StaticCell() {
  const belt = LAYOUT.conveyors;
  return (
    <group>
      <mesh position={[(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, -TABLE_THICKNESS / 2]}>
        <boxGeometry args={[bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, TABLE_THICKNESS]} />
        <meshStandardMaterial color="#6b5a49" roughness={0.9} />
      </mesh>
      <Conveyor id="conveyorJakaToStaubli" layout={belt.jakaToStaubli} />
      <Conveyor id="conveyorStaubliToJaka" layout={belt.staubliToJaka} />
      <Sensor id="jakaSensor" at={{ x: belt.jakaToStaubli.from.x, y: belt.jakaToStaubli.from.y - 85 }} />
      <Sensor id="staubliSensor" at={{ x: belt.jakaToStaubli.to.x, y: belt.jakaToStaubli.to.y - 85 }} />
      <mesh position={[board.x, board.y, board.z / 2]}>
        <boxGeometry args={[board.width, board.depth, board.z]} />
        <meshStandardMaterial color="#fafbfc" roughness={0.4} />
      </mesh>
      {LAYOUT.partSource.map((p, i) => (
        <Pad key={i} at={p} size={part.size + 16} height={2} color="#3a4552" />
      ))}
      <Pad at={LAYOUT.jakaMarkerHolder} size={marker.carrier + 10} height={marker.standOffset + 25} color="#3a4552" />
      <Pad at={LAYOUT.staubliMarkerHolder} size={marker.carrier + 10} height={marker.standOffset + 25} color="#3a4552" />
    </group>
  );
}

/** Ink of the squares, a thin line just above the board. */
export function Ink() {
  const ink = useTwinStore((s) => s.items?.ink);
  if (!ink) return null;
  return (
    <group>
      {ink.map((line, i) =>
        line.length > 1 ? (
          <Line key={i} points={line.map((p) => [p.x, p.y, board.z + 0.8] as [number, number, number])} color="#1d2b8f" lineWidth={3} />
        ) : null,
      )}
    </group>
  );
}

/** Marker (standing upright, tip down) and the two parts. */
export function Items3D() {
  const markerRef = useRef<Group>(null);
  const carrierRef = useRef<Mesh>(null);
  const partRefs = useRef<(Mesh | null)[]>([]);

  useFrame((state) => {
    const items = useTwinStore.getState().items;
    const now = frameTime(state.clock.elapsedTime);
    const visible = items !== null;
    if (markerRef.current) markerRef.current.visible = visible;
    if (!items) {
      partRefs.current.forEach((m) => m && (m.visible = false));
      if (carrierRef.current) carrierRef.current.visible = false;
      return;
    }

    // Marker: position of its tip.
    const belt = LAYOUT.conveyors.jakaToStaubli;
    let tip = { x: 0, y: 0, z: 0 };
    if (items.marker === 'jakaHolder') tip = { ...LAYOUT.jakaMarkerHolder, z: LAYOUT.jakaMarkerHolder.z + marker.standOffset };
    else if (items.marker === 'staubliHolder') tip = { ...LAYOUT.staubliMarkerHolder, z: LAYOUT.staubliMarkerHolder.z + marker.standOffset };
    else if (items.marker === 'belt') {
      const t = items.belt;
      tip = { x: belt.from.x + (belt.to.x - belt.from.x) * t, y: belt.from.y + (belt.to.y - belt.from.y) * t, z: belt.height + marker.standOffset };
    } else {
      const tool = robotAt(items.marker === 'jakaGripper' ? 'jaka' : 'staubli', now).tool;
      tip = { x: tool.x, y: tool.y, z: tool.z - marker.tipReach };
    }
    markerRef.current?.position.set(tip.x, tip.y, tip.z);
    if (carrierRef.current) {
      carrierRef.current.visible = items.marker === 'belt';
      carrierRef.current.position.set(tip.x, tip.y, belt.height + 12);
    }

    // Parts.
    const staubliTool = robotAt('staubli', now).tool;
    items.parts.forEach((place, i) => {
      const mesh = partRefs.current[i];
      if (!mesh) return;
      mesh.visible = true;
      const at =
        place === 'source'
          ? { ...LAYOUT.partSource[i]!, z: part.height / 2 }
          : place === 'board'
            ? { ...LAYOUT.boardSlots[i]!, z: board.z + part.height / 2 }
            : { x: staubliTool.x, y: staubliTool.y, z: staubliTool.z - part.height / 2 };
      mesh.position.set(at.x, at.y, at.z);
    });
  });

  return (
    <group>
      <group ref={markerRef}>
        <mesh position={[0, 0, marker.length / 2]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[marker.diameter / 2, marker.diameter / 2, marker.length, 16]} />
          <meshStandardMaterial color="#e9edf1" />
        </mesh>
        <mesh position={[0, 0, marker.length - 12]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[marker.diameter / 2 + 1, marker.diameter / 2 + 1, 24, 16]} />
          <meshStandardMaterial color="#1d2b8f" />
        </mesh>
        <mesh position={[0, 0, 4]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[3, marker.diameter / 3, 8, 12]} />
          <meshStandardMaterial color="#1d2b8f" />
        </mesh>
      </group>
      <mesh ref={carrierRef}>
        <boxGeometry args={[marker.carrier, marker.carrier, 24]} />
        <meshStandardMaterial color="#59636e" />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => void (partRefs.current[i] = m)}>
          <boxGeometry args={[part.size, part.size, part.height]} />
          <meshStandardMaterial color="#e3a33b" />
        </mesh>
      ))}
    </group>
  );
}
