#version 300 es
precision highp float;

in vec2 i_P;
uniform float pointsize;
uniform float dotSize;

void main() {
    gl_PointSize = pointsize;
    gl_Position = vec4(i_P, 0.0, 1.0);
    if (gl_VertexID == 0) {
        gl_PointSize = dotSize;
    }
}