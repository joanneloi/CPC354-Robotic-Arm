"use strict";

var canvas, gl, program;

var NumVertices = 36; //(6 faces)(2 triangles/face)(3 vertices/triangle)

var points = [];
var colors = [];

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

// RGBA colors
var vertexColors = [
    vec4( 0.0, 0.0, 0.0, 1.0 ),  // black
    vec4( 1.0, 0.0, 0.0, 1.0 ),  // red
    vec4( 1.0, 1.0, 0.0, 1.0 ),  // yellow
    vec4( 0.0, 1.0, 0.0, 1.0 ),  // green
    vec4( 0.0, 0.0, 1.0, 1.0 ),  // blue
    vec4( 1.0, 0.0, 1.0, 1.0 ),  // magenta
    vec4( 1.0, 1.0, 1.0, 1.0 ),  // white
    vec4( 0.0, 1.0, 1.0, 1.0 )   // cyan
];


// Parameters controlling the size of the Robot's arm

var BASE_HEIGHT      = 2.0;
var BASE_WIDTH       = 5.0;
var LOWER_ARM_HEIGHT = 5.0;
var LOWER_ARM_WIDTH  = 0.5;
var UPPER_ARM_HEIGHT = 5.0;
var UPPER_ARM_WIDTH  = 0.5;
var GRIPPER_HEIGHT   = 1.0;
var GRIPPER_WIDTH    = 0.3;
var GRIPPER_DEPTH    = 0.3;
var FINGER_LENGTH    = 1.5;
var FINGER_WIDTH     = 0.2;
var FINGER_DEPTH     = 0.2;

// Shader transformation matrices

var modelViewMatrix, projectionMatrix;

// Array of rotation angles (in degrees) for each rotation axis

var Base = 0;
var LowerArm = 1;
var UpperArm = 2;

var theta = [ 0, 0, 0 ]; // Base, LowerArm, UpperArm angles

var gripperOpen = 0.0; // Controls the opening angle of the V-shaped gripper (in degrees)
var extrusionDepth = 1.0; // Extrusion depth factor (controls thickness/depth of components)
var scaleFactor = 1.0; // Overall scale factor for the entire arm

// Manual rotation and translation controls
var manualRotX = 0;
var manualRotY = 0;
var manualRotZ = 0;
var manualTransX = 0;
var manualTransY = 0;
var manualTransZ = 0;

// Animation and rotation control variables
var lastFrameTime = 0;
var animationSpeed = 1.0;
var isAnimating = false;
var appliedMode = "none"; // "none", "manual", "sequence", "arm_rotate"
var animationAngle = 0; // For continuous rotation animations

// Sequence animation variables
var isSequenceRunning = false;
var sequenceIndex = 0;
var sequenceTime = 0;

// Transform structure for smooth animations
function createArmTransform(base, lower, upper, gripper) {
    return {
        base: base || 0,
        lower: lower || 0,
        upper: upper || 0,
        gripper: gripper || 0.0
    };
}

function cloneArmTransform(transform) {
    return createArmTransform(
        transform.base,
        transform.lower,
        transform.upper,
        transform.gripper
    );
}

function interpolateArmTransform(start, end, t) {
    var lerp = function(a, b, progress) {
        return a + (b - a) * progress;
    };
    var clampedT = Math.max(0, Math.min(1, t));
    return createArmTransform(
        lerp(start.base, end.base, clampedT),
        lerp(start.lower, end.lower, clampedT),
        lerp(start.upper, end.upper, clampedT),
        lerp(start.gripper, end.gripper, clampedT)
    );
}

// Keyframe sequences for robotic arm
var fullSweepSequence = [
    {
        name: "sweep_start",
        duration: 0.5,
        start: createArmTransform(0, 0, 0, 0),
        end: createArmTransform(0, 0, 0, 45)
    },
    {
        name: "sweep_left",
        duration: 2.0,
        start: createArmTransform(0, 0, 0, 45),
        end: createArmTransform(-90, -60, 60, 45)
    },
    {
        name: "sweep_center",
        duration: 2.0,
        start: createArmTransform(-90, -60, 60, 45),
        end: createArmTransform(0, -60, 60, 45)
    },
    {
        name: "sweep_right",
        duration: 2.0,
        start: createArmTransform(0, -60, 60, 45),
        end: createArmTransform(90, -60, 60, 45)
    },
    {
        name: "sweep_return",
        duration: 2.0,
        start: createArmTransform(90, -60, 60, 45),
        end: createArmTransform(0, 0, 0, 0)
    }
];

var exerciseSequence = [
    {
        name: "stretch_up",
        duration: 1.5,
        start: createArmTransform(0, 0, 0, 0),
        end: createArmTransform(0, -90, 90, 0)
    },
    {
        name: "flex_down",
        duration: 1.5,
        start: createArmTransform(0, -90, 90, 0),
        end: createArmTransform(0, 0, 0, 0)
    },
    {
        name: "extend_right",
        duration: 1.5,
        start: createArmTransform(0, 0, 0, 0),
        end: createArmTransform(45, -45, 45, 0)
    },
    {
        name: "flex_left",
        duration: 1.5,
        start: createArmTransform(45, -45, 45, 0),
        end: createArmTransform(-45, -45, 45, 0)
    },
    {
        name: "return_center",
        duration: 1.5,
        start: createArmTransform(-45, -45, 45, 0),
        end: createArmTransform(0, 0, 0, 0)
    }
];

var circularMotionSequence = [
    {
        name: "circle_start",
        duration: 0.5,
        start: createArmTransform(0, -45, 60, 45),
        end: createArmTransform(0, -45, 60, 45)
    },
    {
        name: "circle_1",
        duration: 1.5,
        start: createArmTransform(0, -45, 60, 45),
        end: createArmTransform(90, -45, 60, 45)
    },
    {
        name: "circle_2",
        duration: 1.5,
        start: createArmTransform(90, -45, 60, 45),
        end: createArmTransform(180, -45, 60, 45)
    },
    {
        name: "circle_3",
        duration: 1.5,
        start: createArmTransform(180, -45, 60, 45),
        end: createArmTransform(270, -45, 60, 45)
    },
    {
        name: "circle_4",
        duration: 1.5,
        start: createArmTransform(270, -45, 60, 45),
        end: createArmTransform(360, -45, 60, 45)
    }
];

var objectScanSequence = [
    {
        name: "scan_start",
        duration: 0.5,
        start: createArmTransform(0, 0, 0, 45),
        end: createArmTransform(0, -90, 90, 45)
    },
    {
        name: "scan_extend_0",
        duration: 2.0,
        start: createArmTransform(0, -90, 90, 45),
        end: createArmTransform(0, -180, 180, 45)
    },
    {
        name: "scan_retract_0",
        duration: 2.0,
        start: createArmTransform(0, -180, 180, 45),
        end: createArmTransform(0, 0, 0, 45)
    },
    {
        name: "scan_rotate_90",
        duration: 3.0,
        start: createArmTransform(0, 0, 0, 45),
        end: createArmTransform(90, 0, 0, 45)
    },
    {
        name: "scan_extend_90",
        duration: 2.0,
        start: createArmTransform(90, 0, 0, 45),
        end: createArmTransform(90, -180, 180, 45)
    },
    {
        name: "scan_retract_90",
        duration: 2.0,
        start: createArmTransform(90, -180, 180, 45),
        end: createArmTransform(90, 0, 0, 45)
    },
    {
        name: "scan_rotate_180",
        duration: 3.0,
        start: createArmTransform(90, 0, 0, 45),
        end: createArmTransform(180, 0, 0, 45)
    },
    {
        name: "scan_extend_180",
        duration: 2.0,
        start: createArmTransform(180, 0, 0, 45),
        end: createArmTransform(180, -180, 180, 45)
    },
    {
        name: "scan_retract_180",
        duration: 2.0,
        start: createArmTransform(180, -180, 180, 45),
        end: createArmTransform(180, 0, 0, 45)
    },
    {
        name: "scan_rotate_270",
        duration: 3.0,
        start: createArmTransform(180, 0, 0, 45),
        end: createArmTransform(270, 0, 0, 45)
    },
    {
        name: "scan_extend_270",
        duration: 2.0,
        start: createArmTransform(270, 0, 0, 45),
        end: createArmTransform(270, -180, 180, 45)
    },
    {
        name: "scan_retract_270",
        duration: 2.0,
        start: createArmTransform(270, -180, 180, 45),
        end: createArmTransform(270, 0, 0, 45)
    },
    {
        name: "scan_rotate_360",
        duration: 3.0,
        start: createArmTransform(270, 0, 0, 45),
        end: createArmTransform(360, 0, 0, 45)
    },
    {
        name: "scan_return",
        duration: 2.0,
        start: createArmTransform(360, 0, 0, 45),
        end: createArmTransform(0, 0, 0, 0)
    }
];

// Store all sequences
var allSequences = {
    "full_sweep": fullSweepSequence,
    "exercise": exerciseSequence,
    "circular": circularMotionSequence,
    "object_scan": objectScanSequence
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
    if (!isSequenceRunning || sequenceKeyframes.length === 0) {
        return;
    }

    var currentStage = sequenceKeyframes[sequenceIndex];
    if (!currentStage) {
        stopSequence();
        return;
    }

    sequenceTime += deltaSeconds * animationSpeed;
    var duration = Math.max(currentStage.duration, 0.0001);
    var progress = sequenceTime / duration;

    // Calculate transform with interpolation
    var calcProgress = Math.min(progress, 1.0);
    currentSequenceTransform = interpolateArmTransform(
        currentStage.start,
        currentStage.end,
        calcProgress
    );

    // Apply current transform to theta array and gripper
    theta[Base] = currentSequenceTransform.base;
    theta[LowerArm] = currentSequenceTransform.lower;
    theta[UpperArm] = currentSequenceTransform.upper;
    gripperOpen = currentSequenceTransform.gripper;

    // Update sliders to reflect current values
    document.getElementById("slider1").value = theta[Base];
    document.getElementById("slider2").value = theta[LowerArm];
    document.getElementById("slider3").value = theta[UpperArm];
    document.getElementById("slider4").value = gripperOpen;

    // Check if stage is complete
    if (progress >= 1.0) {
        sequenceIndex += 1;
        sequenceTime = 0;
        if (sequenceIndex >= sequenceKeyframes.length) {
            // Loop back to beginning for continuous animation
            sequenceIndex = 0;
            currentSequenceTransform = cloneArmTransform(sequenceKeyframes[0].start);
        }
    }
}

var modelViewMatrixLoc;

var vBuffer, cBuffer;

init();

//----------------------------------------------------------------------------

function quad(  a,  b,  c,  d ) {
    colors.push(vertexColors[a]);
    points.push(vertices[a]);
    colors.push(vertexColors[a]);
    points.push(vertices[b]);
    colors.push(vertexColors[a]);
    points.push(vertices[c]);
    colors.push(vertexColors[a]);
    points.push(vertices[a]);
    colors.push(vertexColors[a]);
    points.push(vertices[c]);
    colors.push(vertexColors[a]);
    points.push(vertices[d]);
}


function colorCube() {
    quad( 1, 0, 3, 2 );
    quad( 2, 3, 7, 6 );
    quad( 3, 0, 4, 7 );
    quad( 6, 5, 1, 2 );
    quad( 4, 5, 6, 7 );
    quad( 5, 4, 0, 1 );
}


//--------------------------------------------------


function init() {

    canvas = document.getElementById( "gl-canvas" );

    gl = canvas.getContext('webgl2');
    if (!gl) { alert( "WebGL 2.0 isn't available" ); }

    gl.viewport( 0, 0, canvas.width, canvas.height );

    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );
    gl.enable( gl.DEPTH_TEST );

    // Load shaders and initialize attribute buffers
    program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    colorCube();

    // Create and initialize buffer objects
    vBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );

    var positionLoc = gl.getAttribLocation( program, "aPosition" );
    gl.vertexAttribPointer( positionLoc, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( positionLoc );

    cBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, cBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW );

    var colorLoc = gl.getAttribLocation( program, "aColor" );
    gl.vertexAttribPointer( colorLoc, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( colorLoc );

    document.getElementById("slider1").onchange = function(event) {
        theta[0] = event.target.value;
    };
    document.getElementById("slider2").onchange = function(event) {
         theta[1] = event.target.value;
    };
    document.getElementById("slider3").onchange = function(event) {
         theta[2] =  event.target.value;
    };
    document.getElementById("slider4").onchange = function(event) {
         gripperOpen = parseFloat(event.target.value);
    };
    
    // Gripper control buttons
    var graspButton = document.getElementById("graspButton");
    var releaseButton = document.getElementById("releaseButton");
    var slider4 = document.getElementById("slider4");
    
    if (graspButton) {
        graspButton.onclick = function() {
            gripperOpen = 0.0; // Fully closed for grasping
            if (slider4) slider4.value = gripperOpen;
        };
    }
    
    if (releaseButton) {
        releaseButton.onclick = function() {
            gripperOpen = 45.0; // Fully open for releasing
            if (slider4) slider4.value = gripperOpen;
        };
    }
    
    // Animation speed control
    var speedSlider = document.getElementById("speedSlider");
    if (speedSlider) {
        speedSlider.onchange = function(event) {
            animationSpeed = Math.max(0.1, Math.min(5.0, parseFloat(event.target.value)));
        };
    }
    
    // Extrusion depth control
    var extrusionSlider = document.getElementById("extrusionSlider");
    if (extrusionSlider) {
        extrusionSlider.onchange = function(event) {
            extrusionDepth = Math.max(0.1, Math.min(3.0, parseFloat(event.target.value)));
            var extrusionValueDisplay = document.getElementById("extrusionValue");
            if (extrusionValueDisplay) {
                extrusionValueDisplay.textContent = extrusionDepth.toFixed(2);
            }
        };
    }
    
    // Scale factor control
    var scaleSlider = document.getElementById("scaleSlider");
    if (scaleSlider) {
        scaleSlider.onchange = function(event) {
            scaleFactor = Math.max(0.1, Math.min(2.0, parseFloat(event.target.value)));
            var scaleValueDisplay = document.getElementById("scaleValue");
            if (scaleValueDisplay) {
                scaleValueDisplay.textContent = scaleFactor.toFixed(2);
            }
        };
    }
    
    // Manual rotation controls
    var rotationXSlider = document.getElementById("rot_x");
    var rotationYSlider = document.getElementById("rot_y");
    var rotationZSlider = document.getElementById("rot_z");
    
    if (rotationXSlider) {
        rotationXSlider.onchange = function(event) {
            manualRotX = parseFloat(event.target.value);
        };
    }
    if (rotationYSlider) {
        rotationYSlider.onchange = function(event) {
            manualRotY = parseFloat(event.target.value);
        };
    }
    if (rotationZSlider) {
        rotationZSlider.onchange = function(event) {
            manualRotZ = parseFloat(event.target.value);
        };
    }
    
    // Manual translation controls
    var transXSlider = document.getElementById("trans_x");
    var transYSlider = document.getElementById("trans_y");
    var transZSlider = document.getElementById("trans_z");
    
    if (transXSlider) {
        transXSlider.onchange = function(event) {
            manualTransX = parseFloat(event.target.value);
        };
    }
    if (transYSlider) {
        transYSlider.onchange = function(event) {
            manualTransY = parseFloat(event.target.value);
        };
    }
    if (transZSlider) {
        transZSlider.onchange = function(event) {
            manualTransZ = parseFloat(event.target.value);
        };
    }
    
    // Rotation mode selection with dropdown
    var rotationSelect = document.getElementById("rotationModeSelect");
    var applyRotationButton = document.getElementById("applyRotationButton");
    var playPauseButton = document.getElementById("playPauseButton");
    
    function updatePlayPauseButton() {
        if (playPauseButton) {
            var isRunning = isSequenceRunning || isAnimating;
            if (isRunning) {
                playPauseButton.classList.remove("play_state");
                playPauseButton.classList.add("pause_state");
                playPauseButton.textContent = "Pause";
            } else {
                playPauseButton.classList.remove("pause_state");
                playPauseButton.classList.add("play_state");
                playPauseButton.textContent = "Play";
            }
        }
    }
    
    function togglePlayPause() {
        if (appliedMode === "sequence") {
            isSequenceRunning = !isSequenceRunning;
            isAnimating = isSequenceRunning;
        } else if (appliedMode === "arm_rotate") {
            isAnimating = !isAnimating;
        }
        updatePlayPauseButton();
    }
    
    if (applyRotationButton) {
        applyRotationButton.onclick = function() {
            var selected = rotationSelect ? rotationSelect.value : "manual";
            isSequenceRunning = false;
            isAnimating = false;
            animationAngle = 0;
            
            // Check if it's a sequence mode
            if (selected === "full_sweep" || selected === "exercise" || selected === "circular" || selected === "object_scan") {
                appliedMode = "sequence";
                if (allSequences[selected]) {
                    sequenceKeyframes = allSequences[selected];
                }
                startSequence();
                isSequenceRunning = false; // Start paused
            } else if (selected === "manual") {
                appliedMode = "manual";
            } else if (selected === "arm_rotate") {
                appliedMode = "arm_rotate";
            } else {
                appliedMode = "manual";
            }
            updatePlayPauseButton();
        };
    }
    
    if (playPauseButton) {
        playPauseButton.onclick = function() {
            togglePlayPause();
        };
        updatePlayPauseButton();
    }
    
    // Keyboard shortcuts
    window.addEventListener("keydown", function(e) {
        switch(e.code) {
            case "Space":
                e.preventDefault();
                if (playPauseButton) {
                    togglePlayPause();
                }
                break;
            case "KeyR":
                e.preventDefault();
                var resetButton = document.getElementById("resetButton");
                if (resetButton) {
                    resetButton.click();
                }
                break;
        }
    });
    
    // Reset button
    var resetButton = document.getElementById("resetButton");
    if (resetButton) {
        resetButton.onclick = function() {
            isAnimating = false;
            appliedMode = "none";
            animationAngle = 0;
            theta[0] = 0;
            theta[1] = 0;
            theta[2] = 0;
            gripperOpen = 0.0;
            animationSpeed = 1.0;
            extrusionDepth = 1.0;
            scaleFactor = 1.0;
            
            document.getElementById("slider1").value = 0;
            document.getElementById("slider2").value = 0;
            document.getElementById("slider3").value = 0;
            document.getElementById("slider4").value = 0;
            if (speedSlider) {
                speedSlider.value = 1.0;
            }
            if (extrusionSlider) {
                extrusionSlider.value = 1.0;
                var extrusionValueDisplay = document.getElementById("extrusionValue");
                if (extrusionValueDisplay) {
                    extrusionValueDisplay.textContent = "1.00";
                }
            }
            if (scaleSlider) {
                scaleSlider.value = 1.0;
                var scaleValueDisplay = document.getElementById("scaleValue");
                if (scaleValueDisplay) {
                    scaleValueDisplay.textContent = "1.00";
                }
            }
            // Reset manual rotation and translation
            manualRotX = 0;
            manualRotY = 0;
            manualRotZ = 0;
            manualTransX = 0;
            manualTransY = 0;
            manualTransZ = 0;
            if (rotationXSlider) rotationXSlider.value = 0;
            if (rotationYSlider) rotationYSlider.value = 0;
            if (rotationZSlider) rotationZSlider.value = 0;
            if (transXSlider) transXSlider.value = 0;
            if (transYSlider) transYSlider.value = 0;
            if (transZSlider) transZSlider.value = 0;
            // Stop any running sequences
            stopSequence();
            
            // Reset rotation mode selector
            if (rotationSelect) {
                rotationSelect.value = "manual";
            }
            updatePlayPauseButton();
        };
    }

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");

    projectionMatrix = ortho(-10, 10, -10, 10, -10, 10);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

    render();
}

//----------------------------------------------------------------------------


function base() {
    var s = scale(BASE_WIDTH * extrusionDepth * scaleFactor, BASE_HEIGHT * scaleFactor, BASE_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult( translate( 0.0, 0.5 * BASE_HEIGHT * scaleFactor, 0.0 ), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc,  false, flatten(t)  );
    gl.drawArrays( gl.TRIANGLES, 0, NumVertices );
}

//----------------------------------------------------------------------------


function upperArm() {
    var s = scale(UPPER_ARM_WIDTH * extrusionDepth * scaleFactor, UPPER_ARM_HEIGHT * scaleFactor, UPPER_ARM_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * UPPER_ARM_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

//----------------------------------------------------------------------------


function lowerArm() {
    var s = scale(LOWER_ARM_WIDTH * extrusionDepth * scaleFactor, LOWER_ARM_HEIGHT * scaleFactor, LOWER_ARM_WIDTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * LOWER_ARM_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

//----------------------------------------------------------------------------

function gripperBase() {
    var s = scale(GRIPPER_WIDTH * extrusionDepth * scaleFactor, GRIPPER_HEIGHT * scaleFactor, GRIPPER_DEPTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * GRIPPER_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function gripperFinger() {
    var s = scale(FINGER_WIDTH * extrusionDepth * scaleFactor, FINGER_LENGTH * scaleFactor, FINGER_DEPTH * extrusionDepth * scaleFactor);
    var instanceMatrix = mult(translate(0.0, 0.5 * FINGER_LENGTH * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
}

function gripper() {
    // Draw gripper base
    gripperBase();
    
    // Save current modelViewMatrix
    var mvSave = modelViewMatrix;
    
    // V-shape gripper: fingers rotate inward to pinch objects
    // gripperOpen controls the opening angle (0 = closed, larger = more open)
    var leftFingerAngle = -gripperOpen;  // Rotate left finger clockwise (negative)
    var rightFingerAngle = gripperOpen;  // Rotate right finger counter-clockwise (positive)
    
    // Attachment points at the top of the gripper base
    var leftAttachmentX = (GRIPPER_WIDTH/2) * extrusionDepth * scaleFactor;
    var rightAttachmentX = -(GRIPPER_WIDTH/2) * extrusionDepth * scaleFactor;
    
    // Draw left finger (rotates inward from left side)
    // Position at attachment point, then rotate around that point
    modelViewMatrix = mult(mvSave, translate(0.0, GRIPPER_HEIGHT * scaleFactor, 0.0));
    modelViewMatrix = mult(modelViewMatrix, translate(leftAttachmentX, 0.0, 0.0));
    modelViewMatrix = mult(modelViewMatrix, rotate(leftFingerAngle, vec3(0, 0, 1)));
    gripperFinger();
    
    // Draw right finger (rotates inward from right side)
    // Position at attachment point, then rotate around that point
    modelViewMatrix = mult(mvSave, translate(0.0, GRIPPER_HEIGHT * scaleFactor, 0.0));
    modelViewMatrix = mult(modelViewMatrix, translate(rightAttachmentX, 0.0, 0.0));
    modelViewMatrix = mult(modelViewMatrix, rotate(rightFingerAngle, vec3(0, 0, 1)));
    gripperFinger();
    
    // Restore modelViewMatrix
    modelViewMatrix = mvSave;
}

//----------------------------------------------------------------------------


function render(now) {
    // Handle timing with requestAnimationFrame timestamp
    if (typeof now === "undefined") now = performance.now();
    var deltaSeconds = lastFrameTime ? (now - lastFrameTime) / 1000.0 : 0;
    lastFrameTime = now;

    // Handle sequence animation
    if (appliedMode === "sequence" && isSequenceRunning) {
        updateSequence(deltaSeconds);
    }
    
    // Handle different rotation modes
    if (appliedMode === "arm_rotate") {
        if (isAnimating) {
            // Rotate both lower and upper arms in sync
            animationAngle += 30 * deltaSeconds * animationSpeed;
            if (animationAngle >= 360) animationAngle -= 360;
            theta[LowerArm] = animationAngle;
            theta[UpperArm] = -animationAngle * 0.7; // Upper arm rotates in opposite direction
            // Update sliders
            document.getElementById("slider2").value = theta[LowerArm];
            document.getElementById("slider3").value = theta[UpperArm];
        }
    } else if (appliedMode === "manual") {
        // Manual mode - sliders control everything, no auto animation
        // Sliders already handle the updates
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Start with identity matrix for manual transformations
    modelViewMatrix = mat4();
    
    // Apply manual translation if in manual mode
    if (appliedMode === "manual") {
        modelViewMatrix = mult(modelViewMatrix, translate(manualTransX, manualTransY, manualTransZ));
        modelViewMatrix = mult(modelViewMatrix, rotate(manualRotX, vec3(1, 0, 0)));
        modelViewMatrix = mult(modelViewMatrix, rotate(manualRotY, vec3(0, 1, 0)));
        modelViewMatrix = mult(modelViewMatrix, rotate(manualRotZ, vec3(0, 0, 1)));
    }
    
    // Draw the robotic arm
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[Base], vec3(0, 1, 0)));
    base();

    modelViewMatrix = mult(modelViewMatrix, translate(0.0, BASE_HEIGHT * scaleFactor, 0.0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[LowerArm], vec3(0, 0, 1)));
    lowerArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0.0, LOWER_ARM_HEIGHT * scaleFactor, 0.0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[UpperArm], vec3(0, 0, 1)));
    upperArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0.0, UPPER_ARM_HEIGHT * scaleFactor, 0.0));
    gripper();

    requestAnimationFrame(render);
}
