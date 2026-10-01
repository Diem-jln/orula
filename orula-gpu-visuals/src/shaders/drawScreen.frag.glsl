#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 outColor;

uniform sampler2D uDrawTex;
uniform float uBeatTension;
uniform float uVoiceEnergy;
uniform float uTime;

uniform float uGlitchTrigger;
uniform float uInvertTrigger;
uniform int uColorPalette;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = vTexCoord;

    // Glitch horizontal controlado
    if (uGlitchTrigger > 0.05) {
        float sliceY = floor(uv.y * 28.0);
        float sliceNoise = hash(vec2(sliceY, floor(uTime * 24.0)));
        if (sliceNoise > 0.65) {
            float sliceOffset = (hash(vec2(sliceY, uTime)) - 0.5) * 0.040 * uGlitchTrigger;
            uv.x += sliceOffset;
        }
    }

    vec2 uvCenter = (uv - 0.5) * 2.0;
    float distSq = dot(uvCenter, uvCenter);

    // Aberración cromática periférica
    float caShift = (0.0015 + uBeatTension * 0.0035 + uGlitchTrigger * 0.010) * (distSq + 0.15);
    float densityR = texture(uDrawTex, uv + vec2(caShift, 0.0)).r;
    float densityG = texture(uDrawTex, uv).r;
    float densityB = texture(uDrawTex, uv - vec2(caShift, 0.0)).r;

    // Contorno limpio sin ruido residual
    float density = smoothstep(0.035, 0.88, densityG);

    // Paletas cromáticas limpias
    vec3 baseBg = vec3(0.008, 0.010, 0.012);
    vec3 smokeCol = vec3(0.025, 0.035, 0.030);
    vec3 midTone = vec3(0.020, 0.220, 0.140);
    vec3 coreHighlight = vec3(0.880, 0.560, 0.180);

    if (uColorPalette == 1) {
        smokeCol = vec3(0.035, 0.020, 0.040);
        midTone = vec3(0.240, 0.080, 0.320);
        coreHighlight = vec3(0.980, 0.760, 0.220);
    } else if (uColorPalette == 2) {
        smokeCol = vec3(0.015, 0.035, 0.035);
        midTone = vec3(0.030, 0.260, 0.240);
        coreHighlight = vec3(0.920, 0.420, 0.160);
    }

    // Mapeo tonal
    vec3 col = mix(baseBg, smokeCol, smoothstep(0.01, 0.22, density));
    col = mix(col, midTone, smoothstep(0.10, 0.58, density));

    float coreMask = smoothstep(0.48, 0.94, (densityR + densityG + densityB) * 0.333);
    vec3 coreColor = coreHighlight * (1.1 + uBeatTension * 0.35);
    col = mix(col, coreColor, coreMask * 0.90);

    col += pow(densityB, 4.0) * coreHighlight * (0.20 + uBeatTension * 0.18);

    // Inversión negativa limpia
    if (uInvertTrigger > 0.01) {
        vec3 invertedBg = vec3(0.92, 0.93, 0.91);
        vec3 invertedFilaments = vec3(0.08, 0.12, 0.10);
        vec3 invertedCore = vec3(0.85, 0.30, 0.10);

        vec3 invCol = mix(invertedBg, invertedFilaments, smoothstep(0.05, 0.65, density));
        invCol = mix(invCol, invertedCore, coreMask);
        
        col = mix(col, invCol, uInvertTrigger);
    }

    // Viñeta perimetral de profundidad
    float vignette = smoothstep(1.75, 0.30, distSq);
    col *= vignette;

    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}