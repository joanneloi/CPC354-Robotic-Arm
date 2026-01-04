"use strict";

// --- Sequences (keyframes) ---

var fullSweepSequence = [
    { name: "start", duration: 0.5, start: createArmTransform(0,0,0,-45), end: createArmTransform(0,0,0,0) },
    { name: "left", duration: 2.0, start: createArmTransform(0,0,0,0), end: createArmTransform(-90,-60,60,0) },
    { name: "center", duration: 2.0, start: createArmTransform(-90,-60,60,0), end: createArmTransform(0,0,-120,-5) },
    { name: "right", duration: 2.0, start: createArmTransform(0,0,-120,-5), end: createArmTransform(90,60,-60,-35) },
    { name: "return", duration: 2.0, start: createArmTransform(90,60,-60,-35), end: createArmTransform(0,0,0,-45) }
];

var exerciseSequence = [
    { name: "up", duration: 1.5, start: createArmTransform(0,0,0,-45), end: createArmTransform(0,-70,30,-25) },
    { name: "down", duration: 1.5, start: createArmTransform(0,-70,30,-25), end: createArmTransform(0,0,0,-45) },
    { name: "ext_r", duration: 1.5, start: createArmTransform(0,0,0,-45), end: createArmTransform(0,-45,45,-45) },
    { name: "flex_l", duration: 1.5, start: createArmTransform(0,-45,45,-45), end: createArmTransform(0,45,45,-45) },
    { name: "ret", duration: 1.5, start: createArmTransform(0,45,45,-45), end: createArmTransform(0,0,0,-45) }
];

var circularMotionSequence = [
    { name: "q1", duration: 1.5,start: createArmTransform(0,0,0,-45),end: createArmTransform(90,0,0,-45) },
    { name: "q2", duration: 1.5,start: createArmTransform(90,0,0,-45),end: createArmTransform(180,0,0,-45) },
    { name: "q3", duration: 1.0,start: createArmTransform(180, 0, 0, -45),end: createArmTransform(270, 0, 0, -45) },
    { name: "q4", duration: 1.0,start: createArmTransform(270, 0, 0, -45),end: createArmTransform(360, 0, 0, -45) }
];

var pickAndPlaceSequence = [
    // 1. Move to hover position above object
    { name: "align", duration: 1.5,
      start: createArmTransform(0, 0, 0, 0),
      end: createArmTransform(0, -35, 60, 0) },

    // 2. Descend to grab
    { name: "descend_1", duration: 1.0,
      start: createArmTransform(0, -35, 60, 0),
      end: createArmTransform(0, 25, 110, -25) },

    // 3. Grip object
    { name: "grip_action", duration: 0.8,
      start: createArmTransform(0, 25, 110, -25),
      end: createArmTransform(0, 30, 110, -5) },

    // 4. Lift object up
    { name: "lift", duration: 1.0,
      start: createArmTransform(0, 30, 110, -5),
      end: createArmTransform(0, -45, 60, -5) },

    // 5. Rotate to drop zone (end base is patched dynamically)
    { name: "rotate_carry", duration: 2.0,
      start: createArmTransform(0, -45, 60, -5),
      end: createArmTransform(120, -45, 60, -5) },

    // 6. Descend to table
    { name: "descent_2", duration: 1.5,
      start: createArmTransform(120, -45, 60, -5),
      end: createArmTransform(120, 15, 60, -5) },

    // 7. Descend further
    { name: "descend_3", duration: 0.75,
      start: createArmTransform(120, 15, 60, -5),
      end: createArmTransform(120, 15, 120, -5) },

    // 8. Release object
    { name: "release_action", duration: 0.8,
      start: createArmTransform(120, 15, 120, -5),
      end: createArmTransform(120, 5, 120, -35) },

    // 9. Retract arm
    { name: "retract", duration: 1.0,
      start: createArmTransform(120, 5, 120, -35),
      end: createArmTransform(120, 0, 0, -15) },

    // 10. Return to home
    { name: "home", duration: 0.5,
      start: createArmTransform(120, 0, 0, -15),
      end: createArmTransform(0, 0, 0, -5) }
];

var allSequences = {
    "full_sweep": fullSweepSequence,
    "exercise": exerciseSequence,
    "circular": circularMotionSequence,
    "pick_and_place": pickAndPlaceSequence
};

// Runtime sequence pointers
sequenceKeyframes = fullSweepSequence;
currentSequenceTransform = createArmTransform(0, 0, 0, 0);


