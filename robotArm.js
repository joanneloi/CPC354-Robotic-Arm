"use strict";

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
    { name: "down", duration: 1.5, start: createArmTransform(0,-70,30,-25), end: createArmTransform(0,0,0,0) },
    { name: "ext_r", duration: 1.5, start: createArmTransform(0,0,0,0), end: createArmTransform(45,-45,45,0) },
    { name: "flex_l", duration: 1.5, start: createArmTransform(45,-45,45,0), end: createArmTransform(-45,45,45,0) },
    { name: "ret", duration: 1.5, start: createArmTransform(-45,45,45,0), end: createArmTransform(0,0,0,-45) }
];

var circularMotionSequence = [
    { name: "start", duration: 0.5, start: createArmTransform(0,-45,60,-45), end: createArmTransform(0,-65,60,-25) },
    { name: "c1", duration: 1.5, start: createArmTransform(0,-65,60,-25), end: createArmTransform(90,25,60,0) },
    { name: "c2", duration: 1.5, start: createArmTransform(90,25,60,0), end: createArmTransform(180,-45,60,-35) },
    { name: "c3", duration: 1.5, start: createArmTransform(180,-45,60,-35), end: createArmTransform(270,15,60,0) },
    { name: "c4", duration: 1.5, start: createArmTransform(270,15,60,0), end: createArmTransform(360,-45,60,-45) }
];

var objectScanSequence = [
    { name: "start", duration: 1.5, start: createArmTransform(0,0,0,-5), end: createArmTransform(0,-90,100,-35) },
    { name: "ext", duration: 2.0, start: createArmTransform(0,-90,100,-35), end: createArmTransform(0,80,-80,-15) },
    { name: "rot90", duration: 1.0, start: createArmTransform(0,80,-80,-15), end: createArmTransform(90,0,0,0) },
    { name: "start", duration: 1.5, start: createArmTransform(90,0,0,-5), end: createArmTransform(90,-90,100,-35) },
    { name: "ext", duration: 2.0, start: createArmTransform(90,-90,100,-35), end: createArmTransform(90,80,-80,-15) },
    { name: "rot90", duration: 1.0, start: createArmTransform(90,80,-80,0), end: createArmTransform(180,  0, 0, 45) },
    { name: "return", duration: 1.0, start: createArmTransform(180,0,0,45), end: createArmTransform(0,0,0,-5) }
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
    "object_scan": objectScanSequence,
    "pick_and_place": pickAndPlaceSequence // Reuse for simplicity
};

var sequenceKeyframes = fullSweepSequence;
var currentSequenceTransform = createArmTransform(0, 0, 0, 0);

function startSequence() {
    isSequenceRunning = true;
    sequenceIndex = 0;
    sequenceTime = 0;
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

    sequenceTime += deltaSeconds * animationSpeed;
    var duration = Math.max(currentStage.duration, 0.0001);
    var progress = sequenceTime / duration;

    if (appliedMode === "pick_and_place") {
        // Trigger "grasp" logic near the end of the "grip_action" stage
        if (currentStage.name === "align" && progress < 0.1) {
            objectState.x = 7.0; // Reset to original pickup x
            objectState.y = 2.5; // Reset to table height
            objectState.z = 0.0; // Reset to original pickup z
            objectState.isHeld = false; // Ensure it's not held
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
                objectState.x = -4.0; 
                objectState.z = 5.0;
                objectState.y = 0.5; // On table
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
    projectionMatrix = ortho(-14, 14, -14, 14, -100, 100); // Larger view volume to show more
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
    document.getElementById("speedSlider").oninput = function(e) { animationSpeed = parseFloat(e.target.value); };
    document.getElementById("extrusionSlider").oninput = function(e) { 
        extrusionDepth = parseFloat(e.target.value); 
        document.getElementById("extrusionValue").innerText = extrusionDepth.toFixed(2);
    };
    document.getElementById("scaleSlider").oninput = function(e) { 
        scaleFactor = parseFloat(e.target.value); 
        document.getElementById("scaleValue").innerText = scaleFactor.toFixed(2);
    };

    document.getElementById("trans_y").oninput = function(e) { manualTransY = parseFloat(e.target.value); }; 
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
  
    // Zoom slider
    document.getElementById("camZoom").oninput = function(e) { cameraZoom = parseFloat(e.target.value); };


    document.getElementById("resetButton").onclick = function() {
        stopSequence();
        isAnimating = false;
        objectState = {x: 7.0, y: 2.5, z: 0.0, isHeld: false, velocity: 0};
        theta = [0,0,0];
        manualTransX = manualTransY = manualTransZ = 0;
        document.getElementById("trans_y").value = 0;
        
        cameraHori = 45; cameraElevation = 300; cameraZoom = 0;
        document.getElementById("camZoom").value = 0;
        
        syncSliders();
    };

    // Mode selector
    document.getElementById("applyRotationButton").onclick = function() {
        var mode = document.getElementById("rotationModeSelect").value;
        appliedMode = mode;

        if (mode === "pick_and_place") {
            manualTransX = 0;
            manualTransZ = 0;
            manualTransY = 0; 
        } else {
             // Logic for other modes (force drop object)
             objectState.isHeld = false;
             objectState.x = 7.0;
             objectState.y = 0.5;
             objectState.z = 0.0;
        }

        if (allSequences[mode]) {
            sequenceKeyframes = allSequences[mode];
            startSequence();
        } else if (mode === "manual") {
            stopSequence(); isAnimating = false;
        } else if (mode === "arm_rotate") {
            stopSequence(); isAnimating = true;
        }
    };

    document.getElementById("playPauseButton").onclick = function() {
        if(appliedMode === "sequence" || isSequenceRunning) isSequenceRunning = !isSequenceRunning;
        if(appliedMode === "arm_rotate") isAnimating = !isAnimating;
    };
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