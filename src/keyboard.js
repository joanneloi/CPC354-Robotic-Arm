"use strict";

// --- Keyboard Controls ---
(function() {
    'use strict';

    var keyboardInitialized = false;

    // Wait for DOM and scripts to load
    window.addEventListener('load', function() {
        // Wait a bit to ensure globals are available
        setTimeout(initKeyboardControls, 300);
    });

    function initKeyboardControls() {
        if (keyboardInitialized) return;

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

            // Space for play/pause
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

            // Skip if key already being processed
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
                var event = new Event('input', { bubbles: true });
                slider.dispatchEvent(event);
            }

            if (valDisplay) {
                valDisplay.innerText = Math.round(newValue);
            }

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


