import type { Meta, StoryObj } from "@storybook/react-vite";
import { CornerLabel, type CornerLabelProps } from "./CornerLabel";
import { color } from "../theme";

const meta: Meta<typeof CornerLabel> = {
  title: "Foundations/CornerLabel",
  component: CornerLabel,
  argTypes: {
    anchor: { control: "radio", options: ["left", "right"] },
    surface: { control: "radio", options: ["dark", "light"] },
  },
};
export default meta;

type Story = StoryObj<typeof CornerLabel>;

const Frame: React.FC<{ surface: "dark" | "light"; children: React.ReactNode }> = ({
  surface,
  children,
}) => (
  <div
    style={{
      width: 480,
      height: 270,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 24,
      background:
        surface === "dark"
          ? `linear-gradient(180deg, ${color.base.black} 0%, #171310 100%)`
          : "linear-gradient(180deg, #c7ccd1 0%, #eceef0 100%)",
    }}
  >
    {children}
  </div>
);

export const OnDarkLeft: Story = {
  args: { fact: "1985 MR2", name: "GOBLIN", anchor: "left", surface: "dark" },
  render: (args: CornerLabelProps) => (
    <Frame surface={args.surface}>
      <CornerLabel {...args} />
    </Frame>
  ),
};

export const OnLightRight: Story = {
  args: { fact: "AUTOCROSS", name: "KCRSCCA", anchor: "right", surface: "light" },
  render: (args: CornerLabelProps) => (
    <Frame surface={args.surface}>
      <div />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <CornerLabel {...args} />
      </div>
    </Frame>
  ),
};
