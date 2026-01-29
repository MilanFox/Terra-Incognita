// https://nuxt.com/docs/api/configuration/nuxt-config
import { routes } from './config/routes';

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@pinia/nuxt', '@vueuse/nuxt', '@nuxtjs/i18n'],

  components: [{ path: './components', pathPrefix: false }],

  devtools: { enabled: true },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        {
          rel: 'preload',
          href: '/fonts/inter/InterVariable.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: 'anonymous',
        },
        {
          rel: 'preload',
          href: '/fonts/inter/InterVariable-Italic.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: 'anonymous',
        },
      ],
      title: 'Terra Incognita',
      titleTemplate: '%s · Terra Incognita',
    },
  },

  css: ['~/assets/scss/main.scss'],

  routeRules: {
    [`/de${routes.STYLEGUIDE}/**`]: { appLayout: 'styleguide' },
    [`/en${routes.STYLEGUIDE}/**`]: { appLayout: 'styleguide' },
  },

  compatibilityDate: '2024-04-03',

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/scss/variables" as *;',
        },
      },
    },
  },

  postcss: {
    plugins: {
      'postcss-pxtorem': {
        rootValue: 16,
        unitPrecision: 3,
        propList: ['*', '!border*'],
        replace: true,
        mediaQuery: true,
        minPixelValue: 2,
      },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  i18n: {
    baseUrl: 'https://terra-incognita.vercel.app/',
    strategy: 'prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'de', name: 'Deutsch', language: 'de-DE', file: 'de.json' },
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
    bundle: {
      optimizeTranslationDirective: false,
    },
  },
});
