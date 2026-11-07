// Level-0 robot models built from primitives and the placeholder geometry in
// src/model/kinematics.ts (docs/3d-plan.md). All sizes in mm, z up (the
// parent group converts to the Three.js frame).

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group, Mesh, Quaternion, Vector3 } from 'three';
import { jakaFk, SCARA } from '../model/kinematics';
import { LAYOUT } from '../model/layout';
import { useTwinStore } from '../state/store';
import { frameTime, robotAt } from './frame';

const deg = (v: number) => (v * Math.PI) / 180;
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

const COLORS = {
  staubliBody: '#9aa3ab',
  staubliArm: '#f2a22e',
  jakaBody: '#f4f5f7',
  jakaJoint: '#c9ced6',
  gripper: '#4a525b',
  finger: '#2b3036',
};

/** Two-finger gripper hanging below its origin (the tool tip is at z = 0). */
function Gripper({ fingersRef, bodyHeight = 40 }: { fingersRef: React.RefObject<Group | null>; bodyHeight?: number }) {
  return (
    <group>
      <mesh position={[0, 0, bodyHeight / 2 + 30]}>
        <boxGeometry args={[56, 32, bodyHeight]} />
        <meshStandardMaterial color={COLORS.gripper} />
      </mesh>
      <group ref={fingersRef}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 20, 0, 15]} userData={{ side }}>
            <boxGeometry args={[8, 18, 30]} />
            <meshStandardMaterial color={COLORS.finger} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Opens the fingers when empty and sets them to the held object's size. */
function useFingers(robot: 'jaka' | 'staubli') {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const holding = useTwinStore.getState().estimates[robot]?.holding ?? false;
    const items = useTwinStore.getState().items;
    const holdsPlate = items?.plate === (robot === 'jaka' ? 'jakaGripper' : 'staubliGripper');
    const holdsMarker = robot === 'staubli' && items?.marker === 'gripper';
    // Plate: internal grip, fingers open inside its middle hole.
    const gap = !holding
      ? 60
      : holdsPlate
        ? LAYOUT.part.bodyDiameter
        : holdsMarker
          ? LAYOUT.marker.diameter
          : LAYOUT.part.headDiameter;
    ref.current?.children.forEach((child) => {
      const side = (child.userData as { side?: number }).side ?? 1;
      child.position.x = side * (gap / 2 + 4);
    });
  });
  return ref;
}

export function Staubli3D() {
  const mount = LAYOUT.robots.staubli;
  const j1 = useRef<Group>(null);
  const j2 = useRef<Group>(null);
  const quill = useRef<Group>(null);
  const fingers = useFingers('staubli');
  // Arms run above the tool: the tool tip with J3 up is at SCARA.zTop.
  const armZ = SCARA.zTop + 140;
  const columnHeight = armZ + 30;

  useFrame((state) => {
    const { joints } = robotAt('staubli', frameTime(state.clock.elapsedTime));
    const [q1 = 0, q2 = 0, q3 = 0, q4 = 0] = joints;
    if (j1.current) j1.current.rotation.z = deg(q1);
    if (j2.current) j2.current.rotation.z = deg(q2);
    if (quill.current) {
      quill.current.position.z = SCARA.zTop - q3 - armZ;
      quill.current.rotation.z = deg(q4);
    }
  });

  return (
    <group position={[mount.x, mount.y, 0]} rotation-z={deg(mount.yaw)}>
      <mesh position={[0, 0, columnHeight / 2]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[85, 100, columnHeight, 32]} />
        <meshStandardMaterial color={COLORS.staubliBody} />
      </mesh>
      <group ref={j1} position={[0, 0, armZ]}>
        <mesh position={[SCARA.l1 / 2, 0, 0]}>
          <boxGeometry args={[SCARA.l1 + 120, 130, 70]} />
          <meshStandardMaterial color={COLORS.staubliArm} />
        </mesh>
        <group ref={j2} position={[SCARA.l1, 0, -10]}>
          <mesh position={[SCARA.l2 / 2, 0, -45]}>
            <boxGeometry args={[SCARA.l2 + 90, 100, 60]} />
            <meshStandardMaterial color={COLORS.staubliArm} />
          </mesh>
          <group position={[SCARA.l2, 0, 0]}>
            <group ref={quill}>
              {/* Quill (J3/J4 spline shaft) from the tool flange upwards. */}
              <mesh position={[0, 0, 70 + 170]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[12, 12, 340, 16]} />
                <meshStandardMaterial color="#d6dbe0" metalness={0.6} roughness={0.3} />
              </mesh>
              <Gripper fingersRef={fingers} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

const JAKA_LINKS = 6;

export function Jaka3D() {
  const mount = LAYOUT.robots.jaka;
  const links = useRef<(Mesh | null)[]>([]);
  const joints = useRef<(Mesh | null)[]>([]);
  const tool = useRef<Group>(null);
  const fingers = useFingers('jaka');
  const tmp = useRef({ a: new Vector3(), b: new Vector3(), dir: new Vector3(), q: new Quaternion() });

  useFrame((state) => {
    const { joints: q } = robotAt('jaka', frameTime(state.clock.elapsedTime));
    const fk = jakaFk(q);
    const { a, b, dir, q: quat } = tmp.current;
    for (let i = 0; i < JAKA_LINKS; i++) {
      const mesh = links.current[i];
      const p = fk.points[i]!;
      const n = fk.points[i + 1]!;
      a.set(p.x, p.y, p.z);
      b.set(n.x, n.y, n.z);
      dir.subVectors(b, a);
      const length = dir.length();
      if (mesh) {
        mesh.visible = length > 1;
        if (length > 1) {
          mesh.position.copy(a).addScaledVector(dir, 0.5);
          mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
          mesh.scale.set(1, length, 1);
        }
      }
      const joint = joints.current[i];
      if (joint) joint.position.set(n.x, n.y, n.z);
    }
    const flange = fk.points[6]!;
    if (tool.current) {
      tool.current.position.set(flange.x, flange.y, flange.z);
      // Gripper z axis points away from the flange, opposite to the tool approach.
      dir.set(-fk.toolZ.x, -fk.toolZ.y, -fk.toolZ.z);
      tool.current.quaternion.copy(quat.setFromUnitVectors(Z_AXIS, dir));
    }
  });

  return (
    <group position={[mount.x, mount.y, 0]} rotation-z={deg(mount.yaw)}>
      <mesh position={[0, 0, 20]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[62, 62, 40, 32]} />
        <meshStandardMaterial color={COLORS.jakaJoint} />
      </mesh>
      {Array.from({ length: JAKA_LINKS }, (_, i) => (
        <mesh key={`l${i}`} ref={(m) => void (links.current[i] = m)}>
          {/* Unit height, scaled to the link length every frame. */}
          <cylinderGeometry args={[i < 3 ? 38 : 30, i < 3 ? 38 : 30, 1, 20]} />
          <meshStandardMaterial color={COLORS.jakaBody} />
        </mesh>
      ))}
      {Array.from({ length: JAKA_LINKS - 1 }, (_, i) => (
        <mesh key={`j${i}`} ref={(m) => void (joints.current[i] = m)}>
          <sphereGeometry args={[i < 3 ? 46 : 36, 20, 16]} />
          <meshStandardMaterial color={COLORS.jakaJoint} />
        </mesh>
      ))}
      <group ref={tool}>
        <Gripper fingersRef={fingers} />
      </group>
    </group>
  );
}
