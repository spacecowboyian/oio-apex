import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },

    // this suite is almost always previewed sitting on black/dark-gray
    // video footage, per Ian — default every story to a dark canvas instead
    // of Storybook's default white.
    backgrounds: {
      options: {
        dark: { name: "Dark", value: "#000000" },
        light: { name: "Light", value: "#ffffff" },
      },
    },
  },

  initialGlobals: {
    backgrounds: { value: "dark" },
  },
};

export default preview;
