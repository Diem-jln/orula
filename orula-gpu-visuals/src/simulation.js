// src/simulation.js

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createGLProgram(gl, shaderList, transformFeedbackVaryings = null) {
    const program = gl.createProgram();
    for (const info of shaderList) {
        const shader = createShader(gl, info.type, info.source);
        gl.attachShader(program, shader);
    }
    if (transformFeedbackVaryings) {
        gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.INTERLEAVED_ATTRIBS);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

function setupParticleBufferVAO(gl, buffers, vao, typeSize) {
    gl.bindVertexArray(vao);
    for (const buf of buffers) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer_object);
        let offset = 0;
        for (const attribName in buf.attribs) {
            const desc = buf.attribs[attribName];
            gl.enableVertexAttribArray(desc.location);
            gl.vertexAttribPointer(desc.location, desc.num_components, desc.type, false, buf.stride, offset);
            offset += desc.num_components * typeSize;
        }
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function initialParticleData(numParts) {
    const data = [];
    for (let i = 0; i < numParts; ++i) {
        data.push(Math.random() * 2.0 - 1.0);
        data.push(Math.random() * 2.0 - 1.0);
        data.push(i / numParts);
        data.push(Math.random() * 2.0 * Math.PI);
    }
    return data;
}

function lerp(start, end, amount) {
    return (1.0 - amount) * start + amount * end;
}

function eerp(start, end, amount) {
    const safeStart = Math.max(start, 0.00001);
    const safeEnd = Math.max(end, 0.00001);
    return Math.pow(safeStart, 1.0 - amount) * Math.pow(safeEnd, amount);
}

function smartParamLerp(a, b, amount) {
    const c = new Float32Array(20);
    for (let i = 0; i < 20; ++i) {
        if (i === 1 || i === 4 || i === 7 || i === 11) {
            c[i] = eerp(a[i], b[i], amount);
        } else if (i === 19) {
            c[i] = eerp(a[i], b[i], Math.pow(amount, 6.0));
        } else {
            c[i] = lerp(a[i], b[i], amount);
        }
    }
    return c;
}

export class Simulation {
    constructor(gl, params, shaders) {
        this.gl = gl;
        this.params = params;
        this.frame = 0;
        this.time = 0.0;
        
        this.audioBands = { bass: 0.0, mid: 0.0, high: 0.0 };
        this.vortexWeight = 0.4;
        this.targetVortexWeight = 0.4;

        // Efectos dinámicos en pantalla
        this.glitchIntensity = 0.0;
        this.invertIntensity = 0.0;
        this.currentPalette = 0; // 0, 1, 2

        this.pastParams = new Float32Array(params.params);
        this.targetParams = new Float32Array(params.params);
        this.lerpParams = new Float32Array(params.params);
        this.lerpProgress = 1.0;

        const posArr = new Array(8).fill(-1.0);
        this.mousePositions = new Float32Array(posArr);

        this.gl.getExtension("EXT_color_buffer_float");
        this.gl.getExtension("OES_texture_float_linear");
        this.gl.getExtension("EXT_float_blend");

        const quadVertSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec2 aTexCoord;
        out vec2 vTexCoord;
        void main() {
            gl_Position = aVertexPosition;
            vTexCoord = aTexCoord;
        }`;

        this.updateParticles = createGLProgram(
            this.gl,
            [
                { source: shaders.particleUpdateVert, type: this.gl.VERTEX_SHADER },
                { source: `#version 300 es\nprecision highp float;\nvoid main() { discard; }`, type: this.gl.FRAGMENT_SHADER }
            ],
            ["v_P", "v_A", "v_T"]
        );

        this.renderParticles = createGLProgram(this.gl, [
            { source: shaders.particleRenderVert, type: this.gl.VERTEX_SHADER },
            { source: shaders.particleRenderFrag, type: this.gl.FRAGMENT_SHADER }
        ]);

        this.updateBlur = createGLProgram(this.gl, [
            { source: quadVertSource, type: this.gl.VERTEX_SHADER },
            { source: shaders.blurFrag, type: this.gl.FRAGMENT_SHADER }
        ]);

        this.clearScreen = createGLProgram(this.gl, [
            { source: quadVertSource, type: this.gl.VERTEX_SHADER },
            { source: shaders.clearScreenFrag, type: this.gl.FRAGMENT_SHADER }
        ]);

        this.drawScreen = createGLProgram(this.gl, [
            { source: quadVertSource, type: this.gl.VERTEX_SHADER },
            { source: shaders.drawScreenFrag, type: this.gl.FRAGMENT_SHADER }
        ]);

        this.update_attribs = {
            i_P: { location: this.gl.getAttribLocation(this.updateParticles, "i_P"), num_components: 2, type: this.gl.FLOAT },
            i_A: { location: this.gl.getAttribLocation(this.updateParticles, "i_A"), num_components: 1, type: this.gl.FLOAT },
            i_T: { location: this.gl.getAttribLocation(this.updateParticles, "i_T"), num_components: 1, type: this.gl.FLOAT }
        };

        this.render_attribs = {
            i_P: { location: this.gl.getAttribLocation(this.renderParticles, "i_P"), num_components: 2, type: this.gl.FLOAT }
        };

        this.vaos = [
            this.gl.createVertexArray(),
            this.gl.createVertexArray(),
            this.gl.createVertexArray(),
            this.gl.createVertexArray()
        ];
        this.buffers = [this.gl.createBuffer(), this.gl.createBuffer()];

        const vao_desc = [
            { vao: this.vaos[0], buffers: [{ buffer_object: this.buffers[0], stride: 16, attribs: this.update_attribs }] },
            { vao: this.vaos[1], buffers: [{ buffer_object: this.buffers[1], stride: 16, attribs: this.update_attribs }] },
            { vao: this.vaos[2], buffers: [{ buffer_object: this.buffers[0], stride: 16, attribs: this.render_attribs }] },
            { vao: this.vaos[3], buffers: [{ buffer_object: this.buffers[1], stride: 16, attribs: this.render_attribs }] }
        ];

        this.params.numParticles = Math.floor(this.params.simSize * this.params.simSize * this.params.particleDensity);
        const initialData = new Float32Array(initialParticleData(this.params.numParticles));

        for (let i = 0; i < 2; i++) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers[i]);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, initialData, this.gl.STREAM_DRAW);
        }

        for (const desc of vao_desc) {
            setupParticleBufferVAO(this.gl, desc.buffers, desc.vao, 4);
        }

        this.read = 0;
        this.write = 1;
        this.quadVao = this._initQuad();

        this.textures = [this._createSimTexture(), this._createSimTexture()];
        this.screenTexture = this._createScreenTexture();
        this.framebuffer = this.gl.createFramebuffer();

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    _createSimTexture() {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RG32F, this.params.simSize, this.params.simSize, 0, this.gl.RG, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
        return tex;
    }

    _createScreenTexture() {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, this.params.renderSize, this.params.renderSize, 0, this.gl.RGBA, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return tex;
    }

    _initQuad() {
        const vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(vao);

        const posBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);

        const texBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([0, 1, 0, 0, 1, 1, 1, 0]), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.bindVertexArray(null);
        return vao;
    }

    morphTo(newParams, vortexWeight = 0.5) {
        this.pastParams.set(this.lerpParams);
        this.targetParams.set(newParams);
        this.targetVortexWeight = vortexWeight;
        this.lerpProgress = 0.0;
    }

    triggerGlitch(intensity = 1.0) {
        this.glitchIntensity = intensity;
    }

    triggerInvert(intensity = 1.0) {
        this.invertIntensity = intensity;
    }

    setPalette(index) {
        this.currentPalette = index % 3;
    }

    updateParticlesHelper() {
        this.frame++;
        this.time += 0.016;

        if (this.lerpProgress < 1.0) {
            this.lerpProgress = Math.min(1.0, this.lerpProgress + 0.028);
            this.lerpParams = smartParamLerp(this.pastParams, this.targetParams, this.lerpProgress);
            this.vortexWeight = lerp(this.vortexWeight, this.targetVortexWeight, 0.035);
        }

        // Decaimiento exponencial de los triggers de glitch e inversión
        this.glitchIntensity *= 0.85;
        this.invertIntensity *= 0.82;

        this.gl.useProgram(this.updateParticles);
        this.gl.uniform1fv(this.gl.getUniformLocation(this.updateParticles, "v"), this.lerpParams);

        this.gl.uniform1f(this.gl.getUniformLocation(this.updateParticles, "uBass"), this.audioBands.bass);
        this.gl.uniform1f(this.gl.getUniformLocation(this.updateParticles, "uMid"), this.audioBands.mid);
        this.gl.uniform1f(this.gl.getUniformLocation(this.updateParticles, "uHigh"), this.audioBands.high);
        this.gl.uniform1f(this.gl.getUniformLocation(this.updateParticles, "uVortexWeight"), this.vortexWeight);

        this.mousePositions[0] = this.params.mouse.x;
        this.mousePositions[1] = 1.0 - this.params.mouse.y;
        for (let i = 7; i >= 2; --i) {
            this.mousePositions[i] = this.mousePositions[i - 2];
        }
        this.gl.uniform1fv(this.gl.getUniformLocation(this.updateParticles, "mps"), this.mousePositions);
        this.gl.uniform1i(this.gl.getUniformLocation(this.updateParticles, "frame"), this.frame);
        this.gl.uniform1i(this.gl.getUniformLocation(this.updateParticles, "pen"), this.params.pen ? 1 : 0);

        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0]);
        this.gl.uniform1i(this.gl.getUniformLocation(this.updateParticles, "u_trail"), 1);
        this.gl.uniform2f(this.gl.getUniformLocation(this.updateParticles, "i_dim"), this.params.simSize, this.params.simSize);

        this.gl.bindVertexArray(this.vaos[this.read]);
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[this.write]);
        this.gl.enable(this.gl.RASTERIZER_DISCARD);
        this.gl.beginTransformFeedback(this.gl.POINTS);
        this.gl.drawArrays(this.gl.POINTS, 0, this.params.numParticles);
        this.gl.endTransformFeedback();
        this.gl.disable(this.gl.RASTERIZER_DISCARD);
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

        const tmp = this.read;
        this.read = this.write;
        this.write = tmp;
    }

    depositParticlesHelper() {
        this.gl.useProgram(this.renderParticles);
        this.gl.uniform1fv(this.gl.getUniformLocation(this.renderParticles, "v"), this.lerpParams);
        this.gl.uniform1i(this.gl.getUniformLocation(this.renderParticles, "deposit"), 1);
        this.gl.uniform1f(this.gl.getUniformLocation(this.renderParticles, "pointsize"), 1.0);
        this.gl.uniform1f(this.gl.getUniformLocation(this.renderParticles, "dotSize"), this.lerpParams[19]);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0]);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.textures[0], 0);

        this.gl.bindVertexArray(this.vaos[this.read + 2]);
        this.gl.viewport(0, 0, this.params.simSize, this.params.simSize);
        this.gl.drawArrays(this.gl.POINTS, 0, this.params.numParticles);
    }

    blurHelper() {
        this.gl.disable(this.gl.BLEND);
        this.gl.bindVertexArray(this.quadVao);
        const blurIterations = Math.max(1, Math.round(this.lerpParams[16]));

        for (let i = 0; i < blurIterations; i++) {
            this.gl.useProgram(this.updateBlur);
            this.gl.uniform1fv(this.gl.getUniformLocation(this.updateBlur, "v"), this.lerpParams);

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.textures[1], 0);

            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0]);
            this.gl.uniform1i(this.gl.getUniformLocation(this.updateBlur, "uUpdateTex"), 1);
            this.gl.uniform2f(this.gl.getUniformLocation(this.updateBlur, "uTextureSize"), this.params.simSize, this.params.simSize);

            this.gl.viewport(0, 0, this.params.simSize, this.params.simSize);
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

            this.textures = [this.textures[1], this.textures[0]];
        }
        this.gl.enable(this.gl.BLEND);
    }

    fadeScreen() {
        this.gl.useProgram(this.clearScreen);
        this.gl.uniform1fv(this.gl.getUniformLocation(this.clearScreen, "v"), this.lerpParams);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.screenTexture, 0);
        this.gl.viewport(0, 0, this.params.renderSize, this.params.renderSize);
        this.gl.bindVertexArray(this.quadVao);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    drawParticlesToCanvas() {
        this.gl.bindVertexArray(this.vaos[this.read + 2]);
        this.gl.useProgram(this.renderParticles);
        this.gl.uniform1fv(this.gl.getUniformLocation(this.renderParticles, "v"), this.lerpParams);
        this.gl.uniform1i(this.gl.getUniformLocation(this.renderParticles, "deposit"), 0);
        this.gl.uniform1f(this.gl.getUniformLocation(this.renderParticles, "pointsize"), 1.0);
        this.gl.uniform1f(this.gl.getUniformLocation(this.renderParticles, "dotSize"), this.lerpParams[19]);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.screenTexture, 0);
        this.gl.viewport(0, 0, this.params.renderSize, this.params.renderSize);
        this.gl.drawArrays(this.gl.POINTS, 0, this.params.numParticles);
    }

    drawCanvasToScreen() {
        this.gl.useProgram(this.drawScreen);
        const combinedTension = this.audioBands.bass * 0.70 + this.audioBands.mid * 0.30;
        this.gl.uniform1f(this.gl.getUniformLocation(this.drawScreen, "uBeatTension"), combinedTension);
        this.gl.uniform1f(this.gl.getUniformLocation(this.drawScreen, "uVoiceEnergy"), this.audioBands.mid);
        this.gl.uniform1f(this.gl.getUniformLocation(this.drawScreen, "uTime"), this.time);
        
        // Pasa los efectos especiales
        this.gl.uniform1f(this.gl.getUniformLocation(this.drawScreen, "uGlitchTrigger"), this.glitchIntensity);
        this.gl.uniform1f(this.gl.getUniformLocation(this.drawScreen, "uInvertTrigger"), this.invertIntensity);
        this.gl.uniform1i(this.gl.getUniformLocation(this.drawScreen, "uColorPalette"), this.currentPalette);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.screenTexture);
        this.gl.uniform1i(this.gl.getUniformLocation(this.drawScreen, "uDrawTex"), 0);

        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
        this.gl.bindVertexArray(this.quadVao);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    draw(bands = { bass: 0.0, mid: 0.0, high: 0.0 }) {
        this.audioBands = bands;
        this.updateParticlesHelper();
        this.depositParticlesHelper();
        this.blurHelper();
        this.fadeScreen();
        this.drawParticlesToCanvas();
        this.drawCanvasToScreen();
    }
}