"use strict";

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

    // Destination plate controls
    (function initDestinationPlateControls() {
        var plateSizeEl = document.getElementById("plateSize");
        var plateXValEl = document.getElementById("plateXValue");
        var plateZValEl = document.getElementById("plateZValue");

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
            var distance = Math.sqrt(dx * dx + dy * dy);

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
            if (isDragging) handleMove(e.clientX, e.clientY);
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
    createJoystick("joystick-knob", "joystick-zone", function(x, y) {
        camJoyX = x;
        camJoyY = y;
    });

    createJoystick("joystick-knob-2", "joystick-zone-2", function(x, y) {
        robotJoyX = x;
        robotJoyZ = y;
    });

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
        theta = [0, 0, 0];
        manualTransX = manualTransY = manualTransZ = 0;
        document.getElementById("trans_y").value = 0;
        document.getElementById("transYValue").innerText = "0.0";

        // Reset destination plate (and its UI)
        destinationPlate.x = destinationPlateDefaults.x;
        destinationPlate.z = destinationPlateDefaults.z;
        destinationPlate.width = destinationPlateDefaults.width;
        destinationPlate.depth = destinationPlateDefaults.depth;

        var plateSizeEl = document.getElementById("plateSize");
        var plateXValEl = document.getElementById("plateXValue");
        var plateZValEl = document.getElementById("plateZValue");
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
        // Handle sequence-based modes (pick_and_place, full_sweep, exercise, circular)
        if (allSequences[appliedMode]) {
            if (isSequenceRunning) {
                // Pause
                isSequenceRunning = false;
            } else {
                // Play
                if (sequenceIndex === 0 && sequenceTime === 0) {
                    startSequence();
                } else {
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
            return;
        }

        updatePlayPauseButton();
    };

    // Initial button text update
    updatePlayPauseButton();
}


