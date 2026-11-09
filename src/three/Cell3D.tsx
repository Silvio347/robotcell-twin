// 3D view of the cell (lazy-loaded from App). Level-0 models: primitives
// built from the placeholder layout and kinematics. See docs/3d-plan.md.

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RobotId } from '../model/cell';
import { SCARA } from '../model/kinematics';
import { LAYOUT } from '../model/layout';
import { ROBOTS } from '../model/robots';
import { useTwinStore } from '../state/store';
import { Jaka3D, Staubli3D } from './Robots3D';
import { Ink, Items3D, StaticCell } from './Scene3D';

/** Cell mm (z up) → Three.js metres (y up). */
const toWorld = (x: number, y: number, z: number): [number, number, number] => [x / 1000, z / 1000, -y / 1000];

const PRESETS = {
  overview: { label: 'Overview', camera: toWorld(650, -2000, 1500), target: toWorld(650, 50, 50) },
  staubli: { label: 'Stäubli', camera: toWorld(500, -700, 800), target: toWorld(0, 100, 150) },
  board: { label: 'Whiteboard', camera: toWorld(-700, 250, 520), target: toWorld(-200, 300, 0) },
  jaka: { label: 'Jaka', camera: toWorld(1100, -900, 800), target: toWorld(1450, -100, 150) },
} as const;
type PresetId = keyof typeof PRESETS;

function CameraRig({ preset }: { preset: PresetId }) {
  const camera = useThree((s) => s.camera);
  // drei's OrbitControls registers itself as the default controls (makeDefault).
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  useEffect(() => {
    const p = PRESETS[preset];
    camera.position.set(...p.camera);
    controls?.target.set(...p.target);
    controls?.update();
  }, [preset, camera, controls]);
  return null;
}

const ROBOT_LIST: RobotId[] = ['staubli', 'jaka'];

/** Label anchor above each robot, in cell mm. */
function labelAnchor(robot: RobotId): [number, number, number] {
  const mount = LAYOUT.robots[robot];
  return toWorld(mount.x, mount.y, robot === 'staubli' ? SCARA.zTop + 420 : 650);
}

/**
 * Projects the label anchors to the screen every frame and moves the HTML
 * labels (plain DOM outside the canvas, so no extra React roots).
 */
function LabelProjector({ labels }: { labels: RefObject<Record<RobotId, HTMLDivElement | null>> }) {
  const v = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    for (const robot of ROBOT_LIST) {
      const el = labels.current?.[robot];
      if (!el) continue;
      v.current.set(...labelAnchor(robot)).project(camera);
      const behind = v.current.z > 1;
      el.style.display = behind ? 'none' : '';
      el.style.transform = `translate(-50%, -100%) translate(${((v.current.x + 1) / 2) * size.width}px, ${((1 - v.current.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

function PhaseLabels({ labels }: { labels: RefObject<Record<RobotId, HTMLDivElement | null>> }) {
  const estimates = useTwinStore((s) => s.estimates);
  return (
    <>
      {ROBOT_LIST.map((robot) => (
        <div
          key={robot}
          className="label-3d"
          ref={(el) => {
            if (labels.current) labels.current[robot] = el;
          }}
        >
          <strong>{ROBOTS[robot].name}</strong>
          {estimates[robot] && <span>{estimates[robot]!.phase}</span>}
        </div>
      ))}
    </>
  );
}

export default function Cell3D({ stale, emergency }: { stale: boolean; emergency: boolean }) {
  const [preset, setPreset] = useState<PresetId>('overview');
  const labels = useRef<Record<RobotId, HTMLDivElement | null>>({ staubli: null, jaka: null });

  return (
    <div className={`cell-3d ${emergency ? 'is-emergency' : ''}`}>
      <Canvas camera={{ fov: 40, near: 0.01, far: 50, position: PRESETS.overview.camera }} dpr={[1, 2]}>
        <color attach="background" args={['#121a22']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <group rotation-x={-Math.PI / 2} scale={0.001}>
          <StaticCell />
          <Ink />
          <Items3D />
          <Staubli3D />
          <Jaka3D />
        </group>
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.05} />
        <CameraRig preset={preset} />
        <LabelProjector labels={labels} />
      </Canvas>
      <PhaseLabels labels={labels} />
      <div className="presets">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button key={id} type="button" className={id === preset ? '' : 'secondary'} onClick={() => setPreset(id)}>
            {PRESETS[id].label}
          </button>
        ))}
      </div>
      {emergency && <div className="banner-3d is-emergency">EMERGENCY STOP</div>}
      {stale && <div className="overlay-3d">No live PLC data</div>}
    </div>
  );
}
