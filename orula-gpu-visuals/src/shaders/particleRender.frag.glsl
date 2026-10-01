#version 300 es
precision highp float;

out vec4 FragColor;
uniform float[20] v;
uniform int deposit;

void main() {
    float opacity = (deposit == 1) ? v[14] : v[17];
    if (dot(gl_PointCoord - 0.5, gl_PointCoord - 0.5) > 0.25) {
        discard;
    }
    FragColor = vec4(1.0, 1.0, 1.0, opacity);
}