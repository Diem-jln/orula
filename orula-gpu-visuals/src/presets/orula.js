// src/presets/orula.js
export const orulaPreset = {
  name: "Orula",
  track: "Orula - Víctor Mendívil",
  simSize: 512,
  renderSize: 1080,
  particleDensity: 2.8,
  convergenceRate: 0.08,
  // 20 parámetros:
  params: new Float32Array([
    2.15,   // [0]  Sensor Distance Base
    6.40,   // [1]  Sensor Distance Power
    0.15,   // [2]  Sensor Distance Scale
    1.45,   // [3]  Sensor Angle Base
    2.80,   // [4]  Sensor Angle Power
    0.35,   // [5]  Sensor Angle Scale
    2.35,   // [6]  Rotation Angle Base
    12.5,   // [7]  Rotation Angle Power
    0.45,   // [8]  Rotation Angle Scale
    0.85,   // [9]  Move Distance Base (cadencia pausada)
    5.20,   // [10] Move Distance Power
    0.12,   // [11] Move Distance Scale
    0.45,   // [12] Sensor Y Offset
    2.10,   // [13] Sensor X Offset (deriva centrípeta)
    0.16,   // [14] Deposit Amount
    0.962,  // [15] Decay Rate (persistencia larga de estela)
    2.0,    // [16] Blur Passes
    0.28,   // [17] Draw Opacity
    0.085,  // [18] Clear Screen Opacity (evanescencia ébano)
    12.0    // [19] Dot Size
  ])
};