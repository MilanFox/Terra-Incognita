import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const surface = '#f2c14e';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { fit: 'contain', background: surface } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { fit: 'contain', background: surface } },
  },
  images: ['public/icon.svg'],
});
