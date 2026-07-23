import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    options: {
      /**
       * Sidebar order: Foundations (the reference you check a decision
       * against) first, then the Video components that apply those decisions,
       * then standalone Tools. Anything unlisted sorts after, alphabetically.
       * Within a component, Playground leads — it's the front door, the one
       * story with live controls and an export panel — and the remaining
       * stories keep their file order behind it (returning 0 leaves a pair
       * alone, and Storybook's sort is stable), rather than being
       * force-alphabetized into a meaningless sequence.
       *
       * NOTE: Storybook extracts this function from the source and `eval`s it
       * as plain JS at index time, so it must be entirely self-contained — no
       * TypeScript annotations and no references to module-scope constants.
       * Both break the indexer with a bare `SyntaxError: Unexpected token ':'`
       * / `ReferenceError`, which surfaces only as "Oh no! Something went
       * wrong loading this Storybook" and a failed /index.json.
       */
      storySort: (a, b) => {
        const sections = ["Foundations", "Video", "Tools"];
        const rank = (t) => {
          const i = sections.indexOf(t.split("/")[0]);
          return i === -1 ? sections.length : i;
        };
        const ra = rank(a.title);
        const rb = rank(b.title);
        if (ra !== rb) return ra - rb;
        if (a.title !== b.title) return a.title.localeCompare(b.title, undefined, { numeric: true });
        const pa = a.name === "Playground" ? 0 : 1;
        const pb = b.name === "Playground" ? 0 : 1;
        return pa - pb;
      },
    },

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
