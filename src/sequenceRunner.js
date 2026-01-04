"use strict";

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


