// src/main.js
import { orulaPreset } from "./presets/orula.js";
import { POINTS } from "./presets/points.js";
import { Simulation } from "./simulation.js";
import { AudioAnalyzer } from "./audio/audioAnalyzer.js";
import orulaAudioUrl from "./audio/orula.mp4";

async function loadShaderSource(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error cargando shader: ${url}`);
    return await res.text();
}

const TOPOLOGIES = [
    { name: "Turing Laberíntico", params: POINTS.point09.params, vortex: 0.0 },
    { name: "Ondas Longitudinales", params: POINTS.point08.params, vortex: 0.15 },
    { name: "Bifurcación Táctil", params: POINTS.point05.params, vortex: 0.25 },
    { name: "Singularidades Tensas", params: POINTS.point07.params, vortex: 0.55 },
    { name: "Metaxilografía Pesada", params: POINTS.point13.params, vortex: 0.20 },
    { name: "Espacio Negativo", params: POINTS.point24.params, vortex: 0.10 },
    { name: "Consolidación Circular", params: POINTS.point25.params, vortex: 0.85 },
    { name: "Vórtice Orula", params: orulaPreset.params, vortex: 0.70 }
];

let currentTopoIndex = 7;
let currentPaletteIndex = 0;

function getNextTopology(currentEnergy) {
    let candidates = (currentEnergy > 0.60) ? [2, 3, 6, 7] : [0, 1, 4, 5];
    candidates = candidates.filter(i => i !== currentTopoIndex);
    const chosenIndex = candidates[Math.floor(Math.random() * candidates.length)];
    currentTopoIndex = chosenIndex;
    
    const baseTopo = TOPOLOGIES[chosenIndex];
    const mutated = new Float32Array(baseTopo.params);
    const jitter = (Math.random() - 0.5) * 0.18;
    mutated[3] = Math.max(0.2, mutated[3] + jitter);
    mutated[15] = Math.max(0.925, Math.min(0.976, mutated[15]));
    mutated[16] = Math.round(mutated[16]);

    return { params: mutated, vortex: baseTopo.vortex };
}

async function init() {
    const canvas = document.getElementById("canvas");
    const gl = canvas.getContext("webgl2", { 
        preserveDrawingBuffer: false, 
        powerPreference: "high-performance",
        antialias: false,
        depth: false,
        stencil: false
    });

    if (!gl) {
        alert("Tu navegador no soporta WebGL2.");
        return;
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    const [
        particleUpdateVert,
        particleRenderVert,
        particleRenderFrag,
        blurFrag,
        clearScreenFrag,
        drawScreenFrag
    ] = await Promise.all([
        loadShaderSource("./src/shaders/particleUpdate.vert.glsl"),
        loadShaderSource("./src/shaders/particleRender.vert.glsl"),
        loadShaderSource("./src/shaders/particleRender.frag.glsl"),
        loadShaderSource("./src/shaders/blur.frag.glsl"),
        loadShaderSource("./src/shaders/clearScreen.frag.glsl"),
        loadShaderSource("./src/shaders/drawScreen.frag.glsl")
    ]);

    const params = {
        ...orulaPreset,
        simSize: 512,
        renderSize: 1024,
        mouse: { x: 0.5, y: 0.5 },
        pen: false
    };

    const sim = new Simulation(gl, params, {
        particleUpdateVert,
        particleRenderVert,
        particleRenderFrag,
        blurFrag,
        clearScreenFrag,
        drawScreenFrag
    });

    const audioElement = document.getElementById("audioTrack");
    audioElement.src = orulaAudioUrl;

    const playBtn = document.getElementById("playBtn");
    const hudOverlay = document.getElementById("hud-overlay");
    const analyzer = new AudioAnalyzer(audioElement);
    let isPlaying = false;

    playBtn.addEventListener("click", async () => {
        try {
            await analyzer.play();
            isPlaying = true;
            hudOverlay.classList.remove("hud-visible");
            hudOverlay.classList.add("hud-hidden");
        } catch (err) {
            console.error("Error reproduciendo audio:", err);
            playBtn.textContent = "⚠ Archivo no encontrado";
        }
    });

    window.addEventListener("keydown", async (e) => {
        const key = e.key.toLowerCase();

        if (key === "p") {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().then(() => resize()).catch(() => {});
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().then(() => resize()).catch(() => {});
                }
            }
        }

        if (key === "o") {
            isPlaying = await analyzer.toggle();
            if (!isPlaying) {
                document.body.classList.remove("hide-cursor");
            }
        }
    });

    let cursorTimeout;
    function showCursor() {
        document.body.classList.remove("hide-cursor");
        clearTimeout(cursorTimeout);
        cursorTimeout = setTimeout(() => {
            if (isPlaying) document.body.classList.add("hide-cursor");
        }, 1600);
    }

    window.addEventListener("pointermove", (e) => {
        params.mouse.x = e.clientX / window.innerWidth;
        params.mouse.y = e.clientY / window.innerHeight;
        showCursor();
    });

    window.addEventListener("pointerdown", (e) => {
        if (e.target === canvas) {
            params.pen = true;
            sim.triggerGlitch(0.7); // Feedback táctil con micro-glitch
        }
        showCursor();
    });

    window.addEventListener("pointerup", () => { params.pen = false; });

    // Variables de control rítmico y efectos
    let lastMorphTime = 0;
    let lastInvertTime = 0;
    let lastGlitchTime = 0;
    let lastPaletteChange = 0;

    const MIN_TRANSITION_INTERVAL = 3800;

    function animate(now) {
        const bands = analyzer.getBands();
        const instantEnergy = bands.bass * 0.65 + bands.mid * 0.35;

        if (isPlaying) {
            // 1. INVERSIÓN NEGATIVA ESTOCÁSTICA EN PICOS DE TOLOLOCHE / BEAT
            // Se activa en golpes secos muy altos con enfriamiento de 2.2s
            if (bands.bass > 0.82 && (now - lastInvertTime) > 2200) {
                sim.triggerInvert(1.0);
                lastInvertTime = now;
            }

            // 2. GLITCH HORIZONTAL EN REMATES DE REQUINTO / AGUDOS O CAÍDAS
            if ((bands.high > 0.70 || bands.mid > 0.75) && (now - lastGlitchTime) > 1600) {
                sim.triggerGlitch(0.85);
                lastGlitchTime = now;
            }

            // 3. CAMBIO DE PALETA CROMÁTICA CADA 14 SEGUNDOS O TRAS UN GRAN QUIEBRE
            if ((now - lastPaletteChange) > 14000) {
                currentPaletteIndex = (currentPaletteIndex + 1) % 3;
                sim.setPalette(currentPaletteIndex);
                sim.triggerGlitch(0.5); // Breve destello al cambiar paleta
                lastPaletteChange = now;
            }

            // 4. TRANSICIÓN TOPOLÓGICA ENTRE LOS PRESETS DE 36 POINTS
            if ((now - lastMorphTime) > MIN_TRANSITION_INTERVAL) {
                const isDropOrBreak = (bands.bass > 0.68) || (instantEnergy < 0.12 && (now - lastMorphTime) > 5500);
                if (isDropOrBreak || (now - lastMorphTime) > 7500) {
                    const nextTopo = getNextTopology(instantEnergy);
                    sim.morphTo(nextTopo.params, nextTopo.vortex);
                    lastMorphTime = now;
                }
            }
        }

        sim.draw(bands);
        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

init().catch(console.error);