import type { Meta, StoryObj } from "@storybook/react-vite";
import { FontSuite, TypeScale } from "./Typography";

const meta: Meta = {
  title: "Foundations/Typography",
};
export default meta;

export const Scale: StoryObj<typeof TypeScale> = {
  render: () => <TypeScale />,
};

export const Fonts: StoryObj<typeof FontSuite> = {
  render: () => <FontSuite />,
};
