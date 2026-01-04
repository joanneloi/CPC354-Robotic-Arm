"use strict";

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


