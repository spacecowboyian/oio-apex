import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShapeRule } from "./Shape";

const meta: Meta<typeof ShapeRule> = {
  title: "Foundations/Shape",
  component: ShapeRule,
};
export default meta;

type Story = StoryObj<typeof ShapeRule>;

export const Corners: Story = {};
