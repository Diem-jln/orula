#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 outColor;
uniform float[20] v;

void main() {
    outColor = vec4(0.0, 0.0, 0.0, v[18]);
}