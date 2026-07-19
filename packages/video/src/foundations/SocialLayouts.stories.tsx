import type { Meta, StoryObj } from "@storybook/react-vite";
import { SocialLayouts } from "./SocialLayouts";

const meta: Meta<typeof SocialLayouts> = {
  title: "Foundations/Social Layouts",
  component: SocialLayouts,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SocialLayouts>;

export const Sizes: Story = {};
