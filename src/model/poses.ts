// Taught poses of each robot, in joint space. The estimator moves the robots
// between these poses following the PLC signals (see src/estimator/tasks.ts).
//
// PLACEHOLDER VALUES. They were chosen so the 2D top view looks plausible,
// not read from the robots. Replace them with the real joint values:
//   - Jaka: jog to each point (or open the taught point) in the Jaka app on the
//     cell tablet and copy J1..J6 in degrees.
//   - Stäubli: on the SP2 pendant, jog in joint mode to each point (or check the
//     VAL3 point) and copy J1, J2, J4 in degrees and J3 in mm.
// Then set POSES_ARE_PLACEHOLDERS to false.
//
// 2D view convention: J1 = 0 points the arm towards the conveyor and positive
// J1 turns it counter-clockwise when seen from above.

export type Pose = readonly number[];

export const POSES_ARE_PLACEHOLDERS = true;

/** Jaka Minicobo, [J1..J6] in degrees. */
export const JAKA_POSES = {
  home: [-60, 0, 90, 0, -90, 0],
  abovePart: [-90, 20, 100, -30, -90, 0],
  pickPart: [-90, 35, 105, -50, -90, 0],
  aboveConveyor: [22, 20, 100, -30, -90, 0],
  placeConveyor: [22, 35, 105, -50, -90, 0],
} as const satisfies Record<string, Pose>;

/** Stäubli SCARA, [J1 deg, J2 deg, J3 mm, J4 deg]. */
export const STAUBLI_POSES = {
  home: [120, -120, 0, 0],
  abovePick: [1, -41, 0, 0],
  pick: [1, -41, 150, 0],
  abovePlace: [180, -67, 0, 90],
  place: [180, -67, 140, 90],
} as const satisfies Record<string, Pose>;
