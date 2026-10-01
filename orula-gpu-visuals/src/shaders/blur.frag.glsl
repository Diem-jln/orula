#version 300 es
precision highp float;

uniform vec2 uTextureSize;
uniform sampler2D uUpdateTex;
in vec2 vTexCoord;
out vec2 outState;
uniform float[20] v;

void main() {
    vec2 onePixel = 1.0 / uTextureSize;
    vec2 average = vec2(0.0);

    float dec_x = vTexCoord.x - onePixel.x;
    float inc_x = vTexCoord.x + onePixel.x;
    float dec_y = vTexCoord.y - onePixel.y;
    float inc_y = vTexCoord.y + onePixel.y;

    average += texture(uUpdateTex, vec2(dec_x, dec_y)).rg;
    average += texture(uUpdateTex, vec2(dec_x, vTexCoord.y)).rg;
    average += texture(uUpdateTex, vec2(dec_x, inc_y)).rg;
    average += texture(uUpdateTex, vec2(vTexCoord.x, dec_y)).rg;
    average += texture(uUpdateTex, vTexCoord).rg;
    average += texture(uUpdateTex, vec2(vTexCoord.x, inc_y)).rg;
    average += texture(uUpdateTex, vec2(inc_x, dec_y)).rg;
    average += texture(uUpdateTex, vec2(inc_x, vTexCoord.y)).rg;
    average += texture(uUpdateTex, vec2(inc_x, inc_y)).rg;
    average /= 9.0;

    outState = average * v[15];
}