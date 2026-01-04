"use strict";
// NOTE: This file has been split into multiple scripts under `src/`.
// `robotArm.html` now loads `src/state.js`, `src/render.js`, etc.
// This legacy file is kept for reference but is not included by default.

var canvas, gl, program;

var NumVertices = 36; 
var points = [];
var colors = [];

// --- Standard cube data ---
var vertices = [
    vec4( -0.5, -0.5,  0.5, 1.0 ),
    vec4( -0.5,  0.5,  0.5, 1.0 ),
    vec4(  0.5,  0.5,  0.5, 1.0 ),
    vec4(  0.5, -0.5,  0.5, 1.0 ),
    vec4( -0.5, -0.5, -0.5, 1.0 ),
    vec4( -0.5,  0.5, -0.5, 1.0 ),
    vec4(  0.5,  0.5, -0.5, 1.0 ),
    vec4(  0.5, -0.5, -0.5, 1.0 )
];

var vertexColors = [
    vec4( 0.1, 0.1, 0.1, 1.0 ),  // Black/Dark Gray
    vec4( 1.0, 0.0, 0.0, 1.0 ),  // Red
    vec4( 1.0, 1.0, 0.0, 1.0 ),  // Yellow
    vec4( 0.0, 1.0, 0.0, 1.0 ),  // Green
    vec4( 0.0, 0.0, 1.0, 1.0 ),  // Blue
    vec4( 1.0, 0.0, 1.0, 1.0 ),  // Magenta
    vec4( 0.9, 0.9, 0.9, 1.0 ),  // White (Table)
    vec4( 0.0, 1.0, 1.0, 1.0 )   // Cyan
];

// --- Dimensions ---
var BASE_HEIGHT      = 2.0;
var BASE_WIDTH       = 5.0;
var LOWER_ARM_HEIGHT = 5.0;
var LOWER_ARM_WIDTH  = 0.5;
var UPPER_ARM_HEIGHT = 5.0;
var UPPER_ARM_WIDTH  = 0.5;
var GRIPPER_HEIGHT   = 1.0;
var GRIPPER_WIDTH    = 0.3;
var FINGER_LENGTH    = 1.5;
var FINGER_WIDTH     = 0.2;

// --- Physics / Object State ---
var objectState = {
    x: 7.0, y: 5.5, z: 0.0, // Start position on table
    isHeld: false,
    velocity: 0.0
};

// --- Transformation variables ---
var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc;

var Base = 0;
var LowerArm = 1;
var UpperArm = 2;
var theta = [ 0, 0, 0 ];

var gripperOpen = 0.0; 
var extrusionDepth = 1.0; 
var scaleFactor = 1.0; 

var manualTransX = 0;
var manualTransY = 0;
var manualTransZ = 0;

var cameraHori = 45;
var cameraElevation = 300;
var cameraZoom = 0;

// Camera and robot joystick inputs
var camJoyX = 0; 
var camJoyY = 0;
var robotJoyX = 0;
var robotJoyZ = 0;
// Destination plate joystick inputs
var plateJoyX = 0;
var plateJoyZ = 0;

// Animation state
var lastFrameTime = 0;
var animationSpeed = 1.0;
var isAnimating = false; // For continuous rotation
var isSequenceRunning = false; // For keyframe sequences
var appliedMode = "manual"; 
var animationAngle = 0; 
var sequenceIndex = 0;
var sequenceTime = 0;
var rotationDir = 1; 

// --- Pick & Place helpers ---
// The current pick-and-place keyframes were authored assuming the object is at (x=7, z=0)
// relative to the robot base translation when base rotation is 0.
var PICK_RELATIVE_OFFSET = { x: 7.0, z: 0.0, y: 0.0 };

// Pick & Place dynamic targets (computed per run)
var pickAndPlaceDynamic = {
    carryAngleApplied: false,
    carryAngle: 0,
    pickupPoseApplied: false,
    pickupAngle: 0,
    dropMoveApplied: false
};

function normalizeDegrees180(angleDeg) {
    var a = angleDeg;
    while (a > 180) a -= 360;
    while (a < -180) a += 360;
    return a;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function computeBaseAngleToTarget(baseX, baseZ, targetX, targetZ) {
    var dx = targetX - baseX;
    var dz = targetZ - baseZ;
    // When base rotation is 0, the arm's "reach direction" is along +X in world space.
    // So we need the yaw that points +X toward the target vector in the XZ plane.
    var radians = Math.atan2(dz, dx);
    return normalizeDegrees180(radians * 180 / Math.PI);
}

function applyPickAndPlacePickupPose(sequence, pickupAngle) {
    if (!Array.isArray(sequence)) return;
    for (var i = 0; i < sequence.length; i++) {
        var stage = sequence[i];
        if (!stage || !stage.name) continue;

        // Drive the pickup portion to keep the same base rotation while reaching/gripping/lifting.
        if (stage.name === "align") {
            // Align stage rotates from current pose (seq[0].start) to pickupAngle
            if (stage.end) stage.end.base = pickupAngle;
        }
        if (stage.name === "descend_1" || stage.name === "grip_action" || stage.name === "lift") {
            if (stage.start) stage.start.base = pickupAngle;
            if (stage.end) stage.end.base = pickupAngle;
        }
        // Ensure rotate_carry starts from the pickup angle (end will be set later dynamically).
        if (stage.name === "rotate_carry") {
            if (stage.start) stage.start.base = pickupAngle;
        }
    }
}

function applyPickAndPlaceCarryAngle(sequence, carryAngle) {
    if (!Array.isArray(sequence)) return;
    for (var i = 0; i < sequence.length; i++) {
        var stage = sequence[i];
        if (!stage || !stage.name) continue;

        if (stage.name === "rotate_carry") {
            // Rotate base from whatever it is now to the computed carry angle
            if (stage.end) stage.end.base = carryAngle;
        }

        // Stages that should KEEP the base pointing at the destination
        if (stage.name === "descent_2" || stage.name === "descend_3" || stage.name === "release_action" || stage.name === "retract") {
            if (stage.start) stage.start.base = carryAngle;
            if (stage.end) stage.end.base = carryAngle;
        }

        // Home should rotate back to 0 from the carry angle
        if (stage.name === "home") {
            if (stage.start) stage.start.base = carryAngle;
            if (stage.end) stage.end.base = 0;
        }
    }
}

function computePickBasePoseForObject(obj, currentBaseX, currentBaseZ) {
    // Keep the robot base a bit away from table edges so it doesn't end up "stuck" at the border.
    // Table limits elsewhere are [-10, 10]. We reserve padding for the robot footprint + a margin.
    var TABLE_MIN = -10, TABLE_MAX = 10;
    var BASE_PADDING = 3.0; // tweak if you want the robot to go closer/further to the edges
    var minX = TABLE_MIN + BASE_PADDING, maxX = TABLE_MAX - BASE_PADDING;
    var minZ = TABLE_MIN + BASE_PADDING, maxZ = TABLE_MAX - BASE_PADDING;

    // Desired pickup offset in robot-local space: (x=+7, z=0) from base to object.
    var r = PICK_RELATIVE_OFFSET.x;

    // Search candidate base yaw angles that keep base within padded bounds.
    // Cost prefers minimal base movement and small yaw magnitude.
    var best = null;
    var stepDeg = 5; // smaller = smoother/more optimal, larger = faster
    for (var ang = -180; ang <= 180; ang += stepDeg) {
        var rad = ang * Math.PI / 180;
        var bx = obj.x - r * Math.cos(rad);
        var bz = obj.z - r * Math.sin(rad);

        if (bx < minX || bx > maxX || bz < minZ || bz > maxZ) continue;

        var dx = bx - currentBaseX;
        var dz = bz - currentBaseZ;
        var dist = Math.sqrt(dx * dx + dz * dz);

        var yawPenalty = Math.abs(ang) * 0.01; // small preference for keeping yaw near 0
        var cost = dist + yawPenalty;

        if (!best || cost < best.cost) {
            best = { x: bx, y: PICK_RELATIVE_OFFSET.y, z: bz, angle: normalizeDegrees180(ang), cost: cost };
        }
    }

    // Fallback: if nothing fits in padded bounds, use the original method (with hard clamps)
    if (!best) {
        var target = calculatePickBaseTargetPosition(obj);
        return { x: target.x, y: target.y, z: target.z, angle: 0 };
    }
    return best;
}

/**
 * Calculate a robot base translation (manualTransX/Y/Z) that aligns the arm's
 * existing Pick & Place keyframes to the current object world position.
 *
 * In other words, we move the robot so the object becomes approximately:
 *   (x=7, z=0) in the robot's local XZ plane (with base rotation ~0).
 */
function calculatePickBaseTargetPosition(obj) {
    var targetX = obj.x - PICK_RELATIVE_OFFSET.x;
    var targetZ = obj.z - PICK_RELATIVE_OFFSET.z;
    var targetY = PICK_RELATIVE_OFFSET.y;

    // Keep within table limits used elsewhere
    if (targetX > 10) targetX = 10;
    if (targetX < -10) targetX = -10;
    if (targetZ > 10) targetZ = 10;
    if (targetZ < -10) targetZ = -10;

    return { x: targetX, y: targetY, z: targetZ };
}

// --- Destination plate (drop zone) ---
var destinationPlate = {
    x: -4.0,
    z: 5.0,
    width: 2.0,
    depth: 2.0,
    thickness: 0.08,
    yEpsilon: 0.01 // small lift above the table to avoid z-fighting
};

var destinationPlateDefaults = {
    x: destinationPlate.x,
    z: destinationPlate.z,
    width: destinationPlate.width,
    depth: destinationPlate.depth
};

// Smooth base repositioning for pick mode (avoids teleporting manualTrans)
var pickBaseMove = {
    active: false,
    startX: 0, startY: 0, startZ: 0,
    endX: 0, endY: 0, endZ: 0
};

// Smooth base repositioning for drop phase (moves gripper near destination plate)
var dropBaseMove = {
    active: false,
    startX: 0, startY: 0, startZ: 0,
    endX: 0, endY: 0, endZ: 0
};

function getCurrentArmTransform() {
    return createArmTransform(theta[Base], theta[LowerArm], theta[UpperArm], gripperOpen);
}

function cloneSequenceKeyframes(sequence) {
    // Safe deep clone for our simple {name,duration,start,end} objects
    return JSON.parse(JSON.stringify(sequence));
}


function createArmTransform(base, lower, upper, gripper) {
    return { base: base || 0, lower: lower || 0, upper: upper || 0, gripper: gripper || 0.0 };
}

function cloneArmTransform(transform) {
    return createArmTransform(transform.base, transform.lower, transform.upper, transform.gripper);
}

function interpolateArmTransform(start, end, t) {
    var lerp = function(a, b, progress) { return a + (b - a) * progress; };
    var clampedT = Math.max(0, Math.min(1, t));
    return createArmTransform(
        lerp(start.base, end.base, clampedT),
        lerp(start.lower, end.lower, clampedT),
        lerp(start.upper, end.upper, clampedT),
        lerp(start.gripper, end.gripper, clampedT)
    );
}

// --- Sequences ---

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
    {name: "q3", duration: 1.0,start: createArmTransform(180, 0, 0, -45),end: createArmTransform(270, 0, 0, -45) },
    { name: "q4", duration: 1.0,start: createArmTransform(270, 0, 0, -45),end: createArmTransform(360, 0, 0, -45) }
];

var pickAndPlaceSequence = [
    // 1. Move to hover position above object (x=4)
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

    // 5. Rotate to drop zone (130 degrees)
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
    "pick_and_place": pickAndPlaceSequence // Reuse for simplicity
};

var sequenceKeyframes = fullSweepSequence;
var currentSequenceTransform = createArmTransform(0, 0, 0, 0);
var lastSequenceIndexForStageInit = -1;

function startSequence() {
    isSequenceRunning = true;
    sequenceIndex = 0;
    sequenceTime = 0;
    lastSequenceIndexForStageInit = -1;
    pickBaseMove.active = false;
    dropBaseMove.active = false;
    pickAndPlaceDynamic.carryAngleApplied = false;
    pickAndPlaceDynamic.pickupPoseApplied = false;
    pickAndPlaceDynamic.dropMoveApplied = false;
    if (sequenceKeyframes.length > 0) {
        currentSequenceTransform = cloneArmTransform(sequenceKeyframes[0].start);
    }
}

function stopSequence() {
    isSequenceRunning = false;
    sequenceIndex = 0;
    sequenceTime = 0;
}

function updateSequence(deltaSeconds) {
    if (!isSequenceRunning || sequenceKeyframes.length === 0) return;

    var currentStage = sequenceKeyframes[sequenceIndex];
    if (!currentStage) { stopSequence(); return; }

    // Stage-entry hooks (run once when we enter a new stage)
    if (sequenceIndex !== lastSequenceIndexForStageInit) {
        lastSequenceIndexForStageInit = sequenceIndex;

        if (appliedMode === "pick_and_place") {
            // At the start of each cycle, reposition the robot base so the *current* object position
            // matches the relative pickup location expected by the hardcoded keyframes.
            if (currentStage.name === "align") {
                var pose = computePickBasePoseForObject(objectState, manualTransX, manualTransZ);
                var target = { x: pose.x, y: pose.y, z: pose.z };
                // Smoothly move the base during the "align" stage (avoid teleporting)
                pickBaseMove.active = true;
                pickBaseMove.startX = manualTransX;
                pickBaseMove.startY = manualTransY;
                pickBaseMove.startZ = manualTransZ;
                pickBaseMove.endX = target.x;
                pickBaseMove.endY = target.y;
                pickBaseMove.endZ = target.z;
                // New run/cycle: clear any previously applied carry target
                pickAndPlaceDynamic.carryAngleApplied = false;
                pickAndPlaceDynamic.dropMoveApplied = false;
                dropBaseMove.active = false;
                // Apply a pickup base angle so we can keep the robot away from edges.
                // This rotates the whole pickup motion toward the object while preserving the same keyframes.
                if (!pickAndPlaceDynamic.pickupPoseApplied) {
                    pickAndPlaceDynamic.pickupAngle = pose.angle;
                    applyPickAndPlacePickupPose(sequenceKeyframes, pose.angle);
                    pickAndPlaceDynamic.pickupPoseApplied = true;
                }
            } else {
                // Only move base during align stage
                pickBaseMove.active = false;
            }

            // When we reach the carry rotation stage, compute the correct target base angle
            // to face the destination plate and patch the remaining keyframes for this run.
            if (currentStage.name === "rotate_carry" && !pickAndPlaceDynamic.carryAngleApplied) {
                var carryAngle = computeBaseAngleToTarget(manualTransX, manualTransZ, destinationPlate.x, destinationPlate.z);
                pickAndPlaceDynamic.carryAngle = carryAngle;
                applyPickAndPlaceCarryAngle(sequenceKeyframes, carryAngle);
                pickAndPlaceDynamic.carryAngleApplied = true;
            }

            // During carry rotation, ALSO translate the robot base so the gripper gets near the destination plate
            // before the descent/release stages. We move the base so the plate ends up roughly at local x=+7.
            if (currentStage.name === "rotate_carry" && !pickAndPlaceDynamic.dropMoveApplied) {
                var desiredReach = PICK_RELATIVE_OFFSET.x; // reuse the same reach distance as pickup keyframes
                var rad = pickAndPlaceDynamic.carryAngle * Math.PI / 180;
                var dropX = destinationPlate.x - desiredReach * Math.cos(rad);
                var dropZ = destinationPlate.z - desiredReach * Math.sin(rad);

                // Keep within table limits used elsewhere
                dropX = clamp(dropX, -10, 10);
                dropZ = clamp(dropZ, -10, 10);

                dropBaseMove.active = true;
                dropBaseMove.startX = manualTransX;
                dropBaseMove.startY = manualTransY;
                dropBaseMove.startZ = manualTransZ;
                dropBaseMove.endX = dropX;
                dropBaseMove.endY = manualTransY;
                dropBaseMove.endZ = dropZ;

                pickAndPlaceDynamic.dropMoveApplied = true;
            }
        }
    }

    sequenceTime += deltaSeconds * animationSpeed;
    var duration = Math.max(currentStage.duration, 0.0001);
    var progress = sequenceTime / duration;

    // Smooth base reposition during align stage (pick mode)
    if (appliedMode === "pick_and_place" && currentStage.name === "align" && pickBaseMove.active) {
        var t = Math.max(0, Math.min(1, progress));
        manualTransX = pickBaseMove.startX + (pickBaseMove.endX - pickBaseMove.startX) * t;
        manualTransY = pickBaseMove.startY + (pickBaseMove.endY - pickBaseMove.startY) * t;
        manualTransZ = pickBaseMove.startZ + (pickBaseMove.endZ - pickBaseMove.startZ) * t;
        if (t >= 1.0) {
            pickBaseMove.active = false;
        }
    }

    // Smooth base reposition during carry stage (drop mode)
    if (appliedMode === "pick_and_place" && currentStage.name === "rotate_carry" && dropBaseMove.active) {
        var t2 = Math.max(0, Math.min(1, progress));
        manualTransX = dropBaseMove.startX + (dropBaseMove.endX - dropBaseMove.startX) * t2;
        manualTransY = dropBaseMove.startY + (dropBaseMove.endY - dropBaseMove.startY) * t2;
        manualTransZ = dropBaseMove.startZ + (dropBaseMove.endZ - dropBaseMove.startZ) * t2;
        if (t2 >= 1.0) {
            dropBaseMove.active = false;
        }
    }

    if (appliedMode === "pick_and_place") {
        // Trigger "grasp" logic near the end of the "grip_action" stage
        if (currentStage.name === "align" && progress < 0.1) {
            // Do NOT reset object position here; pick target should be based on current object position.
            // Just ensure it's not held at the start of the sequence.
            objectState.isHeld = false;
        }

        if (currentStage.name === "grip_action" && progress > 0.8) {
            if (!objectState.isHeld) {
                objectState.isHeld = true;

            }
        }
        
        // Trigger "Release" logic near the end of the "release_action" stage
        if (currentStage.name === "release_action" && progress > 0.1) {
            if (objectState.isHeld) {
                objectState.isHeld = false;
                // Calculate drop position
                objectState.x = destinationPlate.x;
                objectState.z = destinationPlate.z;
                objectState.y = 0.5; // On table (plate is visually on table top)
            }
        }
        

    }

    var calcProgress = Math.min(progress, 1.0);
    currentSequenceTransform = interpolateArmTransform(currentStage.start, currentStage.end, calcProgress);

    theta[Base] = currentSequenceTransform.base;
    theta[LowerArm] = currentSequenceTransform.lower;
    theta[UpperArm] = currentSequenceTransform.upper;
    gripperOpen = currentSequenceTransform.gripper;

    syncSliders();

    if (progress >= 1.0) {
        sequenceIndex++;
        sequenceTime = 0;
        if (sequenceIndex >= sequenceKeyframes.length) {
            // Most sequences loop forever, but Pick & Place should run once per load/play.
            if (appliedMode === "pick_and_place") {
                stopSequence();
                // Keep UI consistent (setupEvents has a helper, but it's scoped there)
                var btn = document.getElementById("playPauseButton");
                if (btn) btn.textContent = "Play";
                return;
            }
            sequenceIndex = 0; // Loop forever
        }
    }
}

function syncSliders() {
    document.getElementById("slider1").value = theta[Base];
    document.getElementById("val1").innerText = Math.round(theta[Base]);
    document.getElementById("slider2").value = theta[LowerArm];
    document.getElementById("val2").innerText = Math.round(theta[LowerArm]);
    document.getElementById("slider3").value = theta[UpperArm];
    document.getElementById("val3").innerText = Math.round(theta[UpperArm]);
    document.getElementById("slider4").value = gripperOpen;
    document.getElementById("val4").innerText = Math.round(gripperOpen);
}

// --- Initialization ---
function init() {
    canvas = document.getElementById( "gl-canvas" );
    gl = canvas.getContext('webgl2');
    if (!gl) { alert( "WebGL 2.0 isn't available" ); }

    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, 0.969, 0.929, 1.0 ); // Light orange background (#fff7ed)
    gl.enable( gl.DEPTH_TEST );

    // Joint sliders and parameter sliders are initialized in setupEvents()
    program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    colorCube();

    var vBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );
    var positionLoc = gl.getAttribLocation( program, "aPosition" );
    gl.vertexAttribPointer( positionLoc, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( positionLoc );

    var cBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, cBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW );
    var colorLoc = gl.getAttribLocation( program, "aColor" );
    gl.vertexAttribPointer( colorLoc, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( colorLoc );

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrix = ortho(-16, 16, -16, 16, -100, 100); // Larger view volume to make robot appear smaller
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

    setupEvents();
    render();
}

function setupEvents() {
    // Joint sliders
    document.getElementById("slider1").oninput = function(e) { theta[0] = parseFloat(e.target.value); syncSliders(); };
    document.getElementById("slider2").oninput = function(e) { theta[1] = parseFloat(e.target.value); syncSliders(); };
    document.getElementById("slider3").oninput = function(e) { theta[2] = parseFloat(e.target.value); syncSliders(); };
    document.getElementById("slider4").oninput = function(e) { gripperOpen = parseFloat(e.target.value); syncSliders(); };

    // Parameter sliders
    document.getElementById("speedSlider").oninput = function(e) { 
        animationSpeed = parseFloat(e.target.value); 
        document.getElementById("speedValue").innerText = animationSpeed.toFixed(1);
    };
    document.getElementById("extrusionSlider").oninput = function(e) { 
        extrusionDepth = parseFloat(e.target.value); 
        document.getElementById("extrusionValue").innerText = extrusionDepth.toFixed(2);
    };
    document.getElementById("scaleSlider").oninput = function(e) { 
        scaleFactor = parseFloat(e.target.value); 
        document.getElementById("scaleValue").innerText = scaleFactor.toFixed(2);
    };

    document.getElementById("trans_y").oninput = function(e) { 
        manualTransY = parseFloat(e.target.value); 
        document.getElementById("transYValue").innerText = manualTransY.toFixed(1);
    }; 

    // Destination plate sliders (drop zone)
    (function initDestinationPlateControls() {
        var plateXEl = document.getElementById("plateX");
        var plateZEl = document.getElementById("plateZ");
        var plateSizeEl = document.getElementById("plateSize");
        var plateXValEl = document.getElementById("plateXValue");
        var plateZValEl = document.getElementById("plateZValue");

        // Plate X/Z are now controlled by joystick; if sliders exist (older UI), keep them in sync.
        if (plateXEl) plateXEl.value = destinationPlate.x;
        if (plateZEl) plateZEl.value = destinationPlate.z;
        if (plateXValEl) plateXValEl.innerText = destinationPlate.x.toFixed(1);
        if (plateZValEl) plateZValEl.innerText = destinationPlate.z.toFixed(1);

        if (plateSizeEl) {
            // width/depth are kept equal for a square plate
            var initialSize = destinationPlate.width;
            plateSizeEl.value = initialSize;
            document.getElementById("plateSizeValue").innerText = initialSize.toFixed(1);
            plateSizeEl.oninput = function(e) {
                var size = parseFloat(e.target.value);
                destinationPlate.width = size;
                destinationPlate.depth = size;
                document.getElementById("plateSizeValue").innerText = size.toFixed(1);
            };
        }
    })();
    // Joystick logic
    function createJoystick(knobId, baseId, callback) {
        var stick = document.getElementById(knobId);
        var base = document.getElementById(baseId);
        
        if (!stick || !base) return;

        var isDragging = false;
        var anchorX, anchorY;

        function handleMove(clientX, clientY) {
            if (!isDragging) return;

            var dx = clientX - anchorX;
            var dy = clientY - anchorY;
            var maxDist = 40; 
            var distance = Math.sqrt(dx*dx + dy*dy);
            
            var visualDx = dx;
            var visualDy = dy;

            if (distance > maxDist) {
                var ratio = maxDist / distance;
                visualDx *= ratio;
                visualDy *= ratio;
            }
            
            // Move Visual Knob
            stick.style.transform = `translate(calc(-50% + ${visualDx}px), calc(-50% + ${visualDy}px))`;

            // Normalize Output (-1 to 1) and send to callback
            var inputX = visualDx / maxDist;
            var inputY = visualDy / maxDist;
            callback(inputX, inputY);
        }

        // Mouse Events
        stick.addEventListener('mousedown', function(e) {
            isDragging = true;
            anchorX = e.clientX;
            anchorY = e.clientY;
            stick.style.transition = 'none'; 
        });

        window.addEventListener('mousemove', function(e) {
            if(isDragging) handleMove(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                stick.style.transform = `translate(-50%, -50%)`; 
                stick.style.transition = 'transform 0.2s';
                callback(0, 0); // Reset input to 0 when released
            }
        });
    }
    // Initialize joysticks
    // Joystick 1: Camera (Updates camJoy variables)
    createJoystick("joystick-knob", "joystick-zone", function(x, y) {
        camJoyX = x;
        camJoyY = y;
    });

    // Joystick 2: Robot Movement (Updates robotJoy variables)
    createJoystick("joystick-knob-2", "joystick-zone-2", function(x, y) {
        robotJoyX = x;
        robotJoyZ = y; 
    });

    // Joystick 3: Destination Plate Movement (Updates plateJoy variables)
    createJoystick("joystick-knob-plate", "joystick-zone-plate", function(x, y) {
        plateJoyX = x;
        plateJoyZ = y;
    });
  
    // Zoom slider
    document.getElementById("camZoom").oninput = function(e) { 
        cameraZoom = parseFloat(e.target.value); 
        document.getElementById("zoomValue").innerText = Math.round(cameraZoom);
    };


    document.getElementById("resetButton").onclick = function() {
        stopSequence();
        isAnimating = false;
        pickBaseMove.active = false;
        objectState = {x: 7.0, y: 2.5, z: 0.0, isHeld: false, velocity: 0};
        theta = [0,0,0];
        manualTransX = manualTransY = manualTransZ = 0;
        document.getElementById("trans_y").value = 0;
        document.getElementById("transYValue").innerText = "0.0";

        // Reset destination plate (and its UI)
        destinationPlate.x = destinationPlateDefaults.x;
        destinationPlate.z = destinationPlateDefaults.z;
        destinationPlate.width = destinationPlateDefaults.width;
        destinationPlate.depth = destinationPlateDefaults.depth;
        var plateXEl = document.getElementById("plateX");
        var plateZEl = document.getElementById("plateZ");
        var plateSizeEl = document.getElementById("plateSize");
        var plateXValEl = document.getElementById("plateXValue");
        var plateZValEl = document.getElementById("plateZValue");
        if (plateXEl) plateXEl.value = destinationPlate.x;
        if (plateZEl) plateZEl.value = destinationPlate.z;
        if (plateXValEl) plateXValEl.innerText = destinationPlate.x.toFixed(1);
        if (plateZValEl) plateZValEl.innerText = destinationPlate.z.toFixed(1);
        if (plateSizeEl) { plateSizeEl.value = destinationPlate.width; document.getElementById("plateSizeValue").innerText = destinationPlate.width.toFixed(1); }
        
        cameraHori = 45; cameraElevation = 300; cameraZoom = 0;
        document.getElementById("camZoom").value = 0;
        document.getElementById("zoomValue").innerText = "0";
        
        animationSpeed = 1.0;
        document.getElementById("speedSlider").value = 1.0;
        document.getElementById("speedValue").innerText = "1.0";
        
        syncSliders();
        updatePlayPauseButton();
    };

    // Update play/pause button text based on current state
    function updatePlayPauseButton() {
        var btn = document.getElementById("playPauseButton");
        if (!btn) return;
        
        var isPlaying = false;
        if (allSequences[appliedMode]) {
            isPlaying = isSequenceRunning;
        } else if (appliedMode === "arm_rotate") {
            isPlaying = isAnimating;
        }
        
        btn.textContent = isPlaying ? "Pause" : "Play";
    }

    // Mode selector
    document.getElementById("applyRotationButton").onclick = function() {
        var mode = document.getElementById("rotationModeSelect").value;
        appliedMode = mode;

        if (mode === "pick_and_place") {
            // Base targeting is computed and eased during the "align" stage (see updateSequence)
            pickBaseMove.active = false;
        } else {
             // Logic for other modes (force drop object)
             objectState.isHeld = false;
             objectState.x = 7.0;
             objectState.y = 0.5;
             objectState.z = 0.0;
        }

        if (allSequences[mode]) {
            // For pick_and_place: start from current pose to avoid snapping back to default angles
            if (mode === "pick_and_place") {
                var seq = cloneSequenceKeyframes(allSequences[mode]);
                if (seq.length > 0) {
                    seq[0].start = getCurrentArmTransform();
                }
                sequenceKeyframes = seq;
            } else {
                sequenceKeyframes = allSequences[mode];
            }
            startSequence();
        } else if (mode === "manual") {
            stopSequence(); isAnimating = false;
        } else if (mode === "arm_rotate") {
            stopSequence(); isAnimating = true;
        }
        
        updatePlayPauseButton();
    };
    
    document.getElementById("playPauseButton").onclick = function() {
        // Handle sequence-based modes (pick_and_place, full_sweep, exercise, circular, object_scan)
        if (allSequences[appliedMode]) {
            if (isSequenceRunning) {
                // Pause: stop the sequence
                isSequenceRunning = false;
            } else {
                // Play: start or resume the sequence
                if (sequenceIndex === 0 && sequenceTime === 0) {
                    // If sequence was reset, start fresh
                    startSequence();
                } else {
                    // Otherwise just resume
                    isSequenceRunning = true;
                }
            }
        }
        // Handle continuous rotation mode
        else if (appliedMode === "arm_rotate") {
            isAnimating = !isAnimating;
        }
        // Manual mode doesn't have play/pause
        else if (appliedMode === "manual") {
            // Do nothing in manual mode
            return;
        }
        
        updatePlayPauseButton();
    };
    
    // Initial button text update
    updatePlayPauseButton();
}

// --- Geometry Functions ---

function quad(a, b, c, d) {
    colors.push(vertexColors[a]); points.push(vertices[a]);
    colors.push(vertexColors[a]); points.push(vertices[b]);
    colors.push(vertexColors[a]); points.push(vertices[c]);
    colors.push(vertexColors[a]); points.push(vertices[a]);
    colors.push(vertexColors[a]); points.push(vertices[c]);
    colors.push(vertexColors[a]); points.push(vertices[d]);
}

function colorCube() {
    quad( 1, 0, 3, 2 );
    quad( 2, 3, 7, 6 );
    quad( 3, 0, 4, 7 );
    quad( 6, 5, 1, 2 );
    quad( 4, 5, 6, 7 );
    quad( 5, 4, 0, 1 );
}

function drawObject() {
    var s = scale(1.0, 1.0, 1.0);
    var instanceMatrix = mult(translate(0.0, 0.0, 0.0), s);
    var m = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(m));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function drawTable() {
    var s = scale(20.0, 0.2, 20.0);
    var t = translate(0.0, -0.1, 0.0);
    var m = mult(modelViewMatrix, mult(t, s));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(m));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function drawDestinationPlate() {
    // Table top is at y=0.0 (table is centered at -0.1 with thickness 0.2)
    var yCenter = (destinationPlate.thickness / 2.0) + destinationPlate.yEpsilon;
    var s = scale(destinationPlate.width, destinationPlate.thickness, destinationPlate.depth);
    var t = translate(destinationPlate.x, yCenter, destinationPlate.z);
    var m = mult(modelViewMatrix, mult(t, s));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(m));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

// --- Hierarchy Drawing ---

function base() {
    var s = scale(BASE_WIDTH * extrusionDepth * scaleFactor, BASE_HEIGHT * scaleFactor, BASE_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult( translate( 0.0, 0.5 * BASE_HEIGHT * scaleFactor, 0.0 ), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays( gl.TRIANGLES, 0, NumVertices );
}

function lowerArm() {
    var s = scale(LOWER_ARM_WIDTH * extrusionDepth * scaleFactor, LOWER_ARM_HEIGHT * scaleFactor, LOWER_ARM_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * LOWER_ARM_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function upperArm() {
    var s = scale(UPPER_ARM_WIDTH * extrusionDepth * scaleFactor, UPPER_ARM_HEIGHT * scaleFactor, UPPER_ARM_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * UPPER_ARM_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function gripper() {
    var gHeight = GRIPPER_HEIGHT * scaleFactor;
    var gWidth = GRIPPER_WIDTH * extrusionDepth * scaleFactor;
    
    // Base of gripper
    var s = scale(gWidth * 2, gHeight, gWidth);
    var t = mult(modelViewMatrix, mult(translate(0, gHeight/2, 0), s));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);

    var wristMatrix = modelViewMatrix;

    // Fingers
    var fLen = FINGER_LENGTH * scaleFactor;
    var fWid = FINGER_WIDTH * extrusionDepth * scaleFactor;
    
    // Left finger
    modelViewMatrix = mult(wristMatrix, translate(-gWidth, gHeight, 0)); 
    modelViewMatrix = mult(modelViewMatrix, rotate(gripperOpen, vec3(0,0,1))); 
    modelViewMatrix = mult(modelViewMatrix, translate(0, fLen/2, 0));
    var fs = scale(fWid, fLen, fWid);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mult(modelViewMatrix, fs)));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);

    // Right finger
    modelViewMatrix = mult(wristMatrix, translate(gWidth, gHeight, 0)); 
    modelViewMatrix = mult(modelViewMatrix, rotate(-gripperOpen, vec3(0,0,1))); 
    modelViewMatrix = mult(modelViewMatrix, translate(0, fLen/2, 0));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mult(modelViewMatrix, fs)));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);

    // Held object
    if (objectState.isHeld) {
        modelViewMatrix = wristMatrix;
        modelViewMatrix = mult(modelViewMatrix, translate(0, 2.0 * scaleFactor, 0));
        modelViewMatrix = mult(modelViewMatrix, scale(0.8, 0.8, 0.8));
        drawObject();
    }
}

// --- Logic ---
function render(now) {
    if (typeof now === "undefined") now = performance.now();
    var deltaSeconds = lastFrameTime ? (now - lastFrameTime) / 1000.0 : 0;
    lastFrameTime = now;

    // Updates
    if (isSequenceRunning) updateSequence(deltaSeconds);
    if (appliedMode === "arm_rotate" && isAnimating) {
        var floorLimit = -140; 
        var highLimit = 100;   

        // Increment based on direction 
        animationAngle += 60 * deltaSeconds * animationSpeed * rotationDir;

        // Check limits and flip direction
        if (animationAngle > highLimit) {
            animationAngle = highLimit;
            rotationDir = -1; // Go Down
        }
        if (animationAngle < floorLimit) {
            animationAngle = floorLimit;
            rotationDir = 1;  // Go Up
        }
        
        theta[UpperArm] = animationAngle;

        // Continuous base rotation
        theta[Base] -= 60 * deltaSeconds * animationSpeed; 


        theta[LowerArm] = 30; 

        syncSliders();
    }

    // Physics (Gravity)
    if (!objectState.isHeld) {
        if (objectState.y > 0.5) {
            objectState.y -= 0.1 * animationSpeed; // Fall
        } else {
            objectState.y = 0.5; // Floor
        }
    }

    // Joystick Controls
    // Camera joystick logic
    if (camJoyX !== 0 || camJoyY !== 0) {
        var camSpeed = 90.0;
        cameraHori += camJoyX * camSpeed * deltaSeconds;
        cameraElevation += camJoyY * camSpeed * deltaSeconds;
        if (cameraElevation > 360) cameraElevation = 360;
        if (cameraElevation < 180) cameraElevation = 180;
    }

    // Robot Movement Joystick Logic including collision detection
    if (appliedMode !== "pick_and_place") {
    if (robotJoyX !== 0 || robotJoyZ !== 0) {
        var robotSpeed = 5.0; 
        
        // Calculate the potential new position 
        var nextX = manualTransX + (robotJoyX * robotSpeed * deltaSeconds);
        var nextZ = manualTransZ + (robotJoyZ * robotSpeed * deltaSeconds);
        
        //  Define Collision Variables
        var isBlocked = false;

        var dx = nextX - objectState.x;
        var dz = nextZ - objectState.z;
        var dist = Math.sqrt(dx*dx + dz*dz);

        // If too close, flag it as blocked
        //  Collision distance = robot radius (2.5) + object radius (~1.0)
        if (dist < 3.5) {
            isBlocked = true; 
        }

        // Apply movement only if its not blocked
        if (!isBlocked) {
            manualTransX = nextX;
            manualTransZ = nextZ;
        } 
        
        // Keep on table limits
        if (manualTransX > 10) manualTransX = 10;
        if (manualTransX < -10) manualTransX = -10;
        if (manualTransZ > 10) manualTransZ = 10;
        if (manualTransZ < -10) manualTransZ = -10;
    }
    }

    // Destination Plate Joystick Logic (always available)
    if (plateJoyX !== 0 || plateJoyZ !== 0) {
        var plateSpeed = 5.0;
        destinationPlate.x += plateJoyX * plateSpeed * deltaSeconds;
        destinationPlate.z += plateJoyZ * plateSpeed * deltaSeconds;

        // Keep within slider/table limits
        destinationPlate.x = clamp(destinationPlate.x, -10, 10);
        destinationPlate.z = clamp(destinationPlate.z, -10, 10);

        // Sync destination plate sliders/labels if present
        var plateXEl = document.getElementById("plateX");
        var plateZEl = document.getElementById("plateZ");
        var plateXVal = document.getElementById("plateXValue");
        var plateZVal = document.getElementById("plateZValue");
        if (plateXEl) plateXEl.value = destinationPlate.x;
        if (plateZEl) plateZEl.value = destinationPlate.z;
        if (plateXVal) plateXVal.innerText = destinationPlate.x.toFixed(1);
        if (plateZVal) plateZVal.innerText = destinationPlate.z.toFixed(1);
    }
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    // 1. Initialize Matrix
    modelViewMatrix = mat4();

    // 2. Apply Camera/View Transforms FIRST (Moves the whole world)
    var zoomScale = 1.0 + (cameraZoom / 20.0); 
    if (zoomScale < 0.1) zoomScale = 0.1; // Prevent inverting
    
    modelViewMatrix = mult(modelViewMatrix, scale(zoomScale, zoomScale, zoomScale));

    // Rotate Vertical (X-axis) -  0-90 degrees
    modelViewMatrix = mult(modelViewMatrix, rotate(cameraElevation, vec3(1, 0, 0)));
    // Rotate Horizontal (Y-axis) - 360 degrees
    modelViewMatrix = mult(modelViewMatrix, rotate(cameraHori, vec3(0, 1, 0)));

    //  Position camera to view the scene (moved upward)
    modelViewMatrix = mult(modelViewMatrix, translate(0, -2.5, 0));

    var savedWorld = modelViewMatrix;
    // Draw scene
    drawTable();
    drawDestinationPlate();
    
    if (!objectState.isHeld) {  
        modelViewMatrix = savedWorld;
        modelViewMatrix = mult(modelViewMatrix, translate(objectState.x, objectState.y, objectState.z));
        drawObject();
    }
    

    // Draw arm
    modelViewMatrix = savedWorld;
    modelViewMatrix = mult(modelViewMatrix, translate(manualTransX, manualTransY, manualTransZ));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[Base], vec3(0,1,0)));
    base();

    modelViewMatrix = mult(modelViewMatrix, translate(0, BASE_HEIGHT * scaleFactor, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[LowerArm], vec3(0,0,1)));
    lowerArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0, LOWER_ARM_HEIGHT * scaleFactor, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[UpperArm], vec3(0,0,1)));
    upperArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0, UPPER_ARM_HEIGHT * scaleFactor, 0));
    gripper();

    requestAnimationFrame(render);
}

window.onload = init;

// --- Keyboard Controls ---
(function() {
    'use strict';
    
    var keyboardInitialized = false;
    
    // Wait for DOM and robotArm.js to load
    window.addEventListener('load', function() {
        // Wait a bit to ensure robotArm.js variables are available
        setTimeout(initKeyboardControls, 300);
    });

    function initKeyboardControls() {
        if (keyboardInitialized) return;
        
        // Check if required variables exist (they should be in global scope from robotArm.js)
        if (typeof theta === 'undefined' || !Array.isArray(theta)) {
            console.warn('Keyboard controls: theta array not yet available, retrying...');
            setTimeout(initKeyboardControls, 200);
            return;
        }
        
        if (typeof gripperOpen === 'undefined') {
            console.warn('Keyboard controls: gripperOpen variable not yet available, retrying...');
            setTimeout(initKeyboardControls, 200);
            return;
        }

        keyboardInitialized = true;
        console.log('Keyboard controls initialized successfully');

        var Base = 0;
        var LowerArm = 1;
        var UpperArm = 2;
        
        var keyStep = 2; // Degrees per key press
        var gripperStep = 2; // Gripper step size
        
        // Key states to track held keys (prevent rapid repeat)
        var keysPressed = {};

        // Handle keydown
        document.addEventListener('keydown', function(e) {
            var key = e.key.toLowerCase();
            var keyCode = e.keyCode || e.which;
            
            // Check if user is typing in input field
            var isInputField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
            
            // Handle Enter key (works everywhere)
            if (key === 'enter' || keyCode === 13) {
                if (!isInputField || e.target.type === 'button' || e.target.tagName === 'BUTTON') {
                    e.preventDefault();
                    var resetBtn = document.getElementById('resetButton');
                    if (resetBtn) resetBtn.click();
                }
                return;
            }
            
            // Skip if typing in input fields (except Enter which is handled above)
            if (isInputField) {
                return;
            }
            
            // Space for play/pause (handle early, don't use keysPressed tracking for it)
            if (key === ' ' || keyCode === 32) {
                e.preventDefault();
                var playBtn = document.getElementById('playPauseButton');
                if (playBtn) playBtn.click();
                return;
            }
            
            // Prevent default for specific keys to avoid scrolling
            var preventKeys = ['q', 'a', 'w', 's', 'e', 'd', 'r', 'f'];
            if (preventKeys.includes(key)) {
                e.preventDefault();
            }

            // Skip if key already being processed (except Space which is handled above)
            if (keysPressed[key]) {
                return;
            }
            keysPressed[key] = true;
            
            // Base rotation (Q/A)
            if (key === 'q') {
                updateJoint(Base, keyStep);
            } else if (key === 'a') {
                updateJoint(Base, -keyStep);
            }
            // Lower Arm (W/S)
            else if (key === 'w') {
                updateJoint(LowerArm, keyStep);
            } else if (key === 's') {
                updateJoint(LowerArm, -keyStep);
            }
            // Upper Arm (E/D)
            else if (key === 'e') {
                updateJoint(UpperArm, keyStep);
            } else if (key === 'd') {
                updateJoint(UpperArm, -keyStep);
            }
            // Gripper (R/F)
            else if (key === 'r') {
                updateGripper(gripperStep);
            } else if (key === 'f') {
                updateGripper(-gripperStep);
            }
        });

        // Handle keyup
        document.addEventListener('keyup', function(e) {
            var key = e.key.toLowerCase();
            if (keysPressed.hasOwnProperty(key)) {
                keysPressed[key] = false;
            }
        });

        // Helper function to update joint angles
        function updateJoint(jointIndex, delta) {
            if (typeof theta === 'undefined' || !Array.isArray(theta)) {
                console.warn('theta array not available');
                return;
            }
            
            // Get current limits based on joint
            var min, max;
            if (jointIndex === Base) {
                min = -180;
                max = 180;
            } else if (jointIndex === LowerArm) {
                min = -45;
                max = 45;
            } else if (jointIndex === UpperArm) {
                min = -150;
                max = 150;
            } else {
                return;
            }

            // Update angle with constraints
            theta[jointIndex] = Math.max(min, Math.min(max, theta[jointIndex] + delta));
            
            // Update slider and display
            var sliderId = 'slider' + (jointIndex + 1);
            var slider = document.getElementById(sliderId);
            var valDisplay = document.getElementById('val' + (jointIndex + 1));
            var newValue = theta[jointIndex];
            
            if (slider) {
                slider.value = newValue;
                // Trigger input event to sync with existing handlers
                var event = new Event('input', { bubbles: true });
                slider.dispatchEvent(event);
            }
            
            if (valDisplay) {
                valDisplay.innerText = Math.round(newValue);
            }

            // Sync sliders if syncSliders function exists
            if (typeof syncSliders === 'function') {
                syncSliders();
            }
        }

        // Helper function to update gripper
        function updateGripper(delta) {
            if (typeof gripperOpen === 'undefined') {
                console.warn('gripperOpen variable not available');
                return;
            }
            
            var min = -45;
            var max = 5;
            
            gripperOpen = Math.max(min, Math.min(max, gripperOpen + delta));
            
            var slider = document.getElementById('slider4');
            var valDisplay = document.getElementById('val4');
            
            if (slider) {
                slider.value = gripperOpen;
                var event = new Event('input', { bubbles: true });
                slider.dispatchEvent(event);
            }
            
            if (valDisplay) {
                valDisplay.innerText = Math.round(gripperOpen);
            }

            if (typeof syncSliders === 'function') {
                syncSliders();
            }
        }
    }
})();