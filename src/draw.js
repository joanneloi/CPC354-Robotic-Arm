"use strict";

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
    var instanceMatrix = mult(translate(0.0, 0.5 * BASE_HEIGHT * scaleFactor, 0.0), s);
    var t = mult(modelViewMatrix, instanceMatrix);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);
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
    var t = mult(modelViewMatrix, mult(translate(0, gHeight / 2, 0), s));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(t));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);

    var wristMatrix = modelViewMatrix;

    // Fingers
    var fLen = FINGER_LENGTH * scaleFactor;
    var fWid = FINGER_WIDTH * extrusionDepth * scaleFactor;

    // Left finger
    modelViewMatrix = mult(wristMatrix, translate(-gWidth, gHeight, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(gripperOpen, vec3(0, 0, 1)));
    modelViewMatrix = mult(modelViewMatrix, translate(0, fLen / 2, 0));
    var fs = scale(fWid, fLen, fWid);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mult(modelViewMatrix, fs)));
    gl.drawArrays(gl.TRIANGLES, 0, NumVertices);

    // Right finger
    modelViewMatrix = mult(wristMatrix, translate(gWidth, gHeight, 0));
    modelViewMatrix = mult(modelViewMatrix, rotate(-gripperOpen, vec3(0, 0, 1)));
    modelViewMatrix = mult(modelViewMatrix, translate(0, fLen / 2, 0));
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


