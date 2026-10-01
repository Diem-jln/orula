#version 300 es
precision highp float;

uniform sampler2D u_trail;
in vec2 i_P;
in float i_A;
in float i_T;

out vec2 v_P;
out float v_A;
out float v_T;

uniform vec2 i_dim;
uniform int pen;
uniform float[20] v;
uniform float[8] mps;
uniform int frame;

// Bandas desacopladas de audio
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uVortexWeight;

vec2 bd(vec2 pos) {
    pos *= 0.5;
    pos += vec2(0.5);
    pos -= floor(pos);
    pos -= vec2(0.5);
    pos *= 2.0;
    return pos;
}

vec2 cr(float t) {
    vec2 G1 = vec2(mps[0], mps[1]);
    vec2 G2 = vec2(mps[2], mps[3]);
    vec2 G3 = vec2(mps[4], mps[5]);
    vec2 G4 = vec2(mps[6], mps[7]);
    vec2 A = G1 * -0.5 + G2 * 1.5 + G3 * -1.5 + G4 * 0.5;
    vec2 B = G1 + G2 * -2.5 + G3 * 2.0 + G4 * -0.5;
    vec2 C = G1 * -0.5 + G3 * 0.5;
    vec2 D = G2;
    return t * (t * (t * A + B) + C) + D;
}

void main() {
    vec2 dir = vec2(cos(i_T), sin(i_T));
    float hd = i_dim.x * 0.5;
    vec2 sp = 0.5 * (i_P + vec2(1.0));

    // Muestreo sensorial
    float sv = texture(u_trail, bd(sp + v[13] / hd * dir + vec2(0.0, v[12] / hd))).x;
    sv = max(sv, 0.000000001);

    // Dinámica fluida: avance garantizado sin colapsar en reposo
    float stepBoost = 1.0 + (uBass * 1.7) + (uMid * 0.7);
    float md = max(v[9] / hd + v[11] * pow(sv, v[10]) * 250.0 / hd, 0.65 / hd) * stepBoost;

    float sd = (v[0] / hd + v[2] * pow(sv, v[1]) * 250.0 / hd) * (1.0 + uBass * 0.8);
    float sa = v[3] + v[5] * pow(sv, v[4]);
    float ra = v[6] + v[8] * pow(sv, v[7]);

    // Muestreo direccional
    float m = texture(u_trail, bd(sp + sd * vec2(cos(i_T), sin(i_T)))).x;
    float l = texture(u_trail, bd(sp + sd * vec2(cos(i_T + sa), sin(i_T + sa)))).x;
    float r = texture(u_trail, bd(sp + sd * vec2(cos(i_T - sa), sin(i_T - sa)))).x;

    // Regla de decisión determinista sin ruido estocástico dispersivo
    float h = i_T;
    if (m > l && m > r) {
        // Mantiene curso continuo
    }
    else if (m < l && m < r) {
        // Inercia suave: leve curvatura sin romper la línea
        h += (fract(sin(dot(i_P, vec2(12.9898, 78.233))) * 43758.5453) > 0.5) ? (ra * 0.15) : (-ra * 0.15);
    }
    else if (l < r) {
        h -= ra;
    }
    else if (l > r) {
        h += ra;
    }

    vec2 nd = vec2(cos(h), sin(h));
    vec2 op = i_P + nd * md;

    // Atractores orbitales
    if (uVortexWeight > 0.01) {
        float t = float(frame) * 0.0035;
        float orbitRadius = 0.38 + sin(t * 1.2) * 0.06 + (uBass * 0.18);
        vec2 attractorA = vec2(sin(t), cos(t * 1.1)) * orbitRadius;
        vec2 attractorB = -attractorA;

        vec2 deltaA = attractorA - i_P;
        vec2 deltaB = attractorB - i_P;
        float distA = max(length(deltaA), 0.045);
        float distB = max(length(deltaB), 0.045);

        vec2 tangentA = vec2(-deltaA.y, deltaA.x) / distA;
        vec2 tangentB = vec2(-deltaB.y, deltaB.x) / distB;

        float force = 0.0011 * uVortexWeight * (1.0 + uBass * 1.3);
        vec2 orbitalForce = (tangentA / distA + tangentB / distB) * force;
        
        float suctionFactor = (uBass * 1.5 + uMid * 0.3) * uVortexWeight * 0.00055;
        vec2 suction = (normalize(deltaA) / (distA * 7.0) + normalize(deltaB) / (distB * 7.0)) * suctionFactor;
        
        op += orbitalForce + suction;
    }

    // Puntero
    const float segmentPop = 0.0005;
    if (pen == 1 && i_A < segmentPop) {
        op = 2.0 * cr(i_A / segmentPop) - vec2(1.0);
    }

    v_P = bd(op);
    v_A = fract(i_A + segmentPop);
    v_T = h;
}