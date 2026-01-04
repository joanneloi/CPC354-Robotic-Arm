"use strict";

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
    quad(1, 0, 3, 2);
    quad(2, 3, 7, 6);
    quad(3, 0, 4, 7);
    quad(6, 5, 1, 2);
    quad(4, 5, 6, 7);
    quad(5, 4, 0, 1);
}


