import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorRamps } from "./ColorRamp";

const meta: Meta<typeof ColorRamps> = {
  title: "Foundations/Color",
  component: ColorRamps,
};
export default meta;

type Story = StoryObj<typeof ColorRamps>;

export const Ramps: Story = {};
