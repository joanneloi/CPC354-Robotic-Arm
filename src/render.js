"use strict";

// --- Logic / render loop ---

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

            // Define Collision Variables
            var isBlocked = false;

            var dx = nextX - objectState.x;
            var dz = nextZ - objectState.z;
            var dist = Math.sqrt(dx * dx + dz * dz);

            // If too close, flag it as blocked
            // Collision distance = robot radius (2.5) + object radius (~1.0)
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

        destinationPlate.x = clamp(destinationPlate.x, -10, 10);
        destinationPlate.z = clamp(destinationPlate.z, -10, 10);

        // Sync destination plate labels if present
        var plateXVal = document.getElementById("plateXValue");
        var plateZVal = document.getElementById("plateZValue");
        if (plateXVal) plateXVal.innerText = destinationPlate.x.toFixed(1);
        if (plateZVal) plateZVal.innerText = destinationPlate.z.toFixed(1);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Initialize Matrix
    modelViewMatrix = mat4();

    // 2. Apply Camera/View Transforms FIRST (Moves the whole world)
    var zoomScale = 1.0 + (cameraZoom / 20.0);
    if (zoomScale < 0.1) zoomScale = 0.1; // Prevent inverting

    modelViewMatrix = mult(modelViewMatrix, scale(zoomScale, zoomScale, zoomScale));

    // Rotate Vertical (X-axis)
    modelViewMatrix = mult(modelViewMatrix, rotate(cameraElevation, vec3(1, 0, 0)));
    // Rotate Horizontal (Y-axis)
    modelViewMatrix = mult(modelViewMatrix, rotate(cameraHori, vec3(0, 1, 0)));

    // Position camera to view the scene
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
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[Base], vec3(0, 1, 0)));
    base();

    modelViewMatrix = mult(modelViewMatrix, translate(0, BASE_HEIGHT * scaleFactor, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[LowerArm], vec3(0, 0, 1)));
    lowerArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0, LOWER_ARM_HEIGHT * scaleFactor, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(theta[UpperArm], vec3(0, 0, 1)));
    upperArm();

    modelViewMatrix = mult(modelViewMatrix, translate(0, UPPER_ARM_HEIGHT * scaleFactor, 0));
    gripper();

    requestAnimationFrame(render);
}


