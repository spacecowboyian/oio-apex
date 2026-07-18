import type { Meta, StoryObj } from "@storybook/react-vite";
import { SocialPostGenerator } from "./SocialPostGenerator";

const meta: Meta<typeof SocialPostGenerator> = {
  title: "Tools/Social Post Generator",
  component: SocialPostGenerator,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SocialPostGenerator>;

export const Default: Story = {};
