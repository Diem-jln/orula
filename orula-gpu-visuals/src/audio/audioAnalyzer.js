// src/audio/audioAnalyzer.js

export class AudioAnalyzer {
    constructor(audioElement) {
        this.audio = audioElement;
        this.audio.crossOrigin = "anonymous";
        this.ctx = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.isInitialized = false;

        this.bass = 0.0;
        this.mid = 0.0;
        this.high = 0.0;
        this.decayRate = 0.86;
    }

    init() {
        if (this.isInitialized) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.analyser = this.ctx.createAnalyser();
        // fftSize 512 entrega 256 bins con alta resolución temporal (~10ms)
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.45; // Respuesta rápida sin lag

        this.source = this.ctx.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.isInitialized = true;
    }

    async play() {
        if (!this.isInitialized) this.init();
        if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
        return this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    toggle() {
        if (this.audio.paused) {
            return this.play().then(() => true);
        } else {
            this.pause();
            return Promise.resolve(false);
        }
    }

    getBands() {
        if (!this.isInitialized || this.audio.paused) {
            return { bass: 0.0, mid: 0.0, high: 0.0 };
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        // Subgraves y Graves: Tololoche / Bombo (bins 1 a 8 ~ 40Hz - 340Hz)
        let bSum = 0;
        for (let i = 1; i <= 8; i++) bSum += this.dataArray[i];
        const rawBass = Math.pow(bSum / (8 * 255.0), 1.6); // Curva exponencial para acentuar el golpe

        // Medios: Voz y Requinto (bins 9 a 40 ~ 380Hz - 1700Hz)
        let mSum = 0;
        for (let i = 9; i <= 40; i++) mSum += this.dataArray[i];
        const rawMid = Math.pow(mSum / (32 * 255.0), 1.4);

        // Agudos: Percusión brillante / cuerdas altas (bins 41 a 120 ~ 1700Hz - 5000Hz)
        let hSum = 0;
        for (let i = 41; i <= 120; i++) hSum += this.dataArray[i];
        const rawHigh = Math.pow(hSum / (80 * 255.0), 1.2);

        // Ataque instantáneo, caída amortiguada
        this.bass = rawBass > this.bass ? rawBass : this.bass * this.decayRate;
        this.mid = rawMid > this.mid ? rawMid : this.mid * this.decayRate;
        this.high = rawHigh > this.high ? rawHigh : this.high * 0.78;

        return {
            bass: Math.min(Math.max(this.bass, 0.0), 1.0),
            mid: Math.min(Math.max(this.mid, 0.0), 1.0),
            high: Math.min(Math.max(this.high, 0.0), 1.0)
        };
    }
}