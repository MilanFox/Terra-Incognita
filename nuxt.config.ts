// https://nuxt.com/docs/api/configuration/nuxt-config
import { routes } from './config/routes';
import { resolve } from 'path';

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

  alias: {
    '@assets': resolve(__dirname, './app/assets'),
    '@config': resolve(__dirname, './config'),
    '@components': resolve(__dirname, './app/components'),
    '@atoms': resolve(__dirname, './app/components/atoms'),
    '@molecules': resolve(__dirname, './app/components/molecules'),
    '@organisms': resolve(__dirname, './app/components/organisms'),
    '@stores': resolve(__dirname, './app/stores'),
    '@composables': resolve(__dirname, './app/composables'),
    '@constants': resolve(__dirname, './app/constants'),
    '@server': resolve(__dirname, './server'),
    '@layouts': resolve(__dirname, './app/layouts'),
    '@middleware': resolve(__dirname, './app/middleware'),
  },

  routeRules: {
    [`${routes.STYLEGUIDE}/**`]: { appLayout: 'styleguide' },
  },

  compatibilityDate: '2024-04-03',

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/scss/global" as *;',
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
    strategy: 'no_prefix',
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
