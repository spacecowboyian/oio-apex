import { addons } from "storybook/manager-api";
import { themes } from "storybook/theming";

// this project lives almost entirely on dark/black video footage — default
// Storybook's own UI chrome (sidebar, toolbar) to dark instead of the
// light/dark toggle following the OS, per Ian.
addons.setConfig({
  theme: themes.dark,
});
