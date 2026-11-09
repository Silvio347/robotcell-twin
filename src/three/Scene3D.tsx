// Static cell and moving objects for the 3D view (mm, z up).

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, Group, MeshStandardMaterial, RepeatWrapping } from 'three';
import type { SignalId } from '../model/cell';
import { LAYOUT, PART_HEIGHT, plateHole, type ConveyorLayout, type Point2 } from '../model/layout';
import { signalValue } from '../model/messages';
import { useTwinStore } from '../state/store';
import { frameTime, robotAt } from './frame';

const { bounds, board, part, plate, marker } = LAYOUT;
const TABLE_THICKNESS = 30;
/** Nominal belt speed for the stripe animation (the demo run takes about 4 s). */
const BELT_TRAVEL_MS = 4000;

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
  // Square pads, except the plate stand which follows the plate's footprint.
  const depth = size > plate.length ? plate.width + 10 : size;
  return (
    <mesh position={[at.x, at.y, (at.z ?? 0) + height / 2]}>
      <boxGeometry args={[size, depth, height]} />
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
      {/* Plate stand on the Stäubli table and the marker holder. */}
      <Pad at={{ ...LAYOUT.staubliPlateSpot, z: 0 }} size={plate.length + 10} height={LAYOUT.staubliPlateSpot.z} color="#3a4552" />
      <Pad at={{ ...LAYOUT.staubliMarkerHolder, z: 0 }} size={40} height={LAYOUT.staubliMarkerHolder.z} color="#3a4552" />
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

/** One big-head part, origin at the bottom of its body. */
function PartMesh({ refCb }: { refCb: (g: Group | null) => void }) {
  return (
    <group ref={refCb}>
      <mesh position={[0, 0, part.bodyHeight / 2]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[part.bodyDiameter / 2, part.bodyDiameter / 2, part.bodyHeight, 20]} />
        <meshStandardMaterial color="#d18f2c" />
      </mesh>
      <mesh position={[0, 0, part.bodyHeight + part.headHeight / 2]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[part.headDiameter / 2, part.headDiameter / 2, part.headHeight, 24]} />
        <meshStandardMaterial color="#e3a33b" />
      </mesh>
    </group>
  );
}

/** Plate (origin at its bottom centre), the two parts and the marker. */
export function Items3D() {
  const plateRef = useRef<Group>(null);
  const markerRef = useRef<Group>(null);
  const partRefs = useRef<(Group | null)[]>([]);

  useFrame((state) => {
    const items = useTwinStore.getState().items;
    const now = frameTime(state.clock.elapsedTime);
    const visible = items !== null;
    if (plateRef.current) plateRef.current.visible = visible;
    if (markerRef.current) markerRef.current.visible = visible;
    partRefs.current.forEach((g) => g && (g.visible = visible));
    if (!items) return;

    // Plate: bottom centre.
    const belt = LAYOUT.conveyors.jakaToStaubli;
    let p = { x: 0, y: 0, z: 0 };
    if (items.plate === 'jakaTable') p = { ...LAYOUT.jakaPlateStart };
    else if (items.plate === 'staubliTable') p = { ...LAYOUT.staubliPlateSpot };
    else if (items.plate === 'belt') {
      const t = items.belt;
      p = { x: belt.from.x + (belt.to.x - belt.from.x) * t, y: belt.from.y + (belt.to.y - belt.from.y) * t, z: belt.height };
    } else {
      const tool = robotAt(items.plate === 'jakaGripper' ? 'jaka' : 'staubli', now).tool;
      p = { x: tool.x, y: tool.y, z: tool.z - plate.thickness / 2 };
    }
    plateRef.current?.position.set(p.x, p.y, p.z);

    // Parts: bottom of the body. In the plate the body sits in its hole.
    const staubliTool = robotAt('staubli', now).tool;
    items.parts.forEach((place, i) => {
      const g = partRefs.current[i];
      if (!g) return;
      const at =
        place === 'plate'
          ? { ...plateHole(p, plate.partHoles[i]!), z: p.z }
          : place === 'board'
            ? { ...LAYOUT.boardSlots[i]!, z: board.z }
            : { x: staubliTool.x, y: staubliTool.y, z: staubliTool.z - (PART_HEIGHT - part.headHeight / 2) };
      g.position.set(at.x, at.y, at.z);
    });

    // Marker: position of its tip.
    const holder = LAYOUT.staubliMarkerHolder;
    const tip =
      items.marker === 'holder'
        ? { x: holder.x, y: holder.y, z: holder.z + marker.standOffset }
        : (() => {
            const tool = robotAt('staubli', now).tool;
            return { x: tool.x, y: tool.y, z: tool.z - marker.tipReach };
          })();
    markerRef.current?.position.set(tip.x, tip.y, tip.z);
  });

  return (
    <group>
      <group ref={plateRef}>
        <mesh position={[0, 0, plate.thickness / 2]}>
          <boxGeometry args={[plate.length, plate.width, plate.thickness]} />
          <meshStandardMaterial color="#7a8794" />
        </mesh>
        {[0, 1, 2].map((h) => (
          <mesh key={h} position={[(h - 1) * plate.holePitch, 0, plate.thickness + 0.3]}>
            <circleGeometry args={[part.bodyDiameter / 2 + 1, 24]} />
            <meshStandardMaterial color="#1f252b" />
          </mesh>
        ))}
      </group>
      {[0, 1].map((i) => (
        <PartMesh key={i} refCb={(g) => void (partRefs.current[i] = g)} />
      ))}
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
    </group>
  );
}
