"use strict";

// --- WebGL / Program ---
var canvas, gl, program;

// --- Geometry buffers ---
var NumVertices = 36;
var points = [];
var colors = [];

// --- Standard cube data ---
var vertices = [
    vec4(-0.5, -0.5,  0.5, 1.0),
    vec4(-0.5,  0.5,  0.5, 1.0),
    vec4( 0.5,  0.5,  0.5, 1.0),
    vec4( 0.5, -0.5,  0.5, 1.0),
    vec4(-0.5, -0.5, -0.5, 1.0),
    vec4(-0.5,  0.5, -0.5, 1.0),
    vec4( 0.5,  0.5, -0.5, 1.0),
    vec4( 0.5, -0.5, -0.5, 1.0)
];

var vertexColors = [
    vec4(0.1, 0.1, 0.1, 1.0),  // Black/Dark Gray
    vec4(1.0, 0.0, 0.0, 1.0),  // Red
    vec4(1.0, 1.0, 0.0, 1.0),  // Yellow
    vec4(0.0, 1.0, 0.0, 1.0),  // Green
    vec4(0.0, 0.0, 1.0, 1.0),  // Blue
    vec4(1.0, 0.0, 1.0, 1.0),  // Magenta
    vec4(0.9, 0.9, 0.9, 1.0),  // White (Table)
    vec4(0.0, 1.0, 1.0, 1.0)   // Cyan
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
var theta = [0, 0, 0];

var gripperOpen = 0.0;
var extrusionDepth = 1.0;
var scaleFactor = 1.0;

var manualTransX = 0;
var manualTransY = 0;
var manualTransZ = 0;

var cameraHori = 45;
var cameraElevation = 300;
var cameraZoom = 0;

// --- Joystick inputs ---
var camJoyX = 0;
var camJoyY = 0;
var robotJoyX = 0;
var robotJoyZ = 0;
var plateJoyX = 0;
var plateJoyZ = 0;

// --- Animation state ---
var lastFrameTime = 0;
var animationSpeed = 1.0;
var isAnimating = false;        // For continuous rotation
var isSequenceRunning = false;  // For keyframe sequences
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

// --- Sequences runtime ---
var sequenceKeyframes; // assigned in src/sequences.js
var currentSequenceTransform; // assigned in src/sequences.js
var lastSequenceIndexForStageInit = -1;


