import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThumbnailGenerator } from "./ThumbnailGenerator";

const meta: Meta<typeof ThumbnailGenerator> = {
  title: "Tools/YouTube Thumbnail",
  component: ThumbnailGenerator,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
