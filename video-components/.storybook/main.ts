import type { StorybookConfig } from '@storybook/react-vite';
import { renderMiddlewarePlugin } from './render-middleware.mjs';
import { socialMiddlewarePlugin } from './social-middleware.mjs';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": "@storybook/react-vite",
  // registers POST /render (render-middleware.mjs) and the /social/*
  // inbox+outbox routes (social-middleware.mjs) on Storybook's own dev
  // server. Only relevant for `storybook dev`; a static `storybook build`
  // has no server for these to hook into, which is fine — both are
  // dev-only tools.
  async viteFinal(viteConfig) {
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(renderMiddlewarePlugin());
    viteConfig.plugins.push(socialMiddlewarePlugin());
    return viteConfig;
  }
};
export default config;