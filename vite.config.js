import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: '/orula/',
  plugins: [glsl()],
  assetsInclude: ['**/*.mp4', '**/*.glsl']
});