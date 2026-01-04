"use strict";

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


