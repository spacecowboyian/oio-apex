import { Meta, StoryObj } from "@storybook/react";
import { SplitTimeComparison } from "./SplitTimeComparison";
import { RallycrossRacer } from "../leaderboard/types";

const meta: Meta<typeof SplitTimeComparison> = {
  title: "Racing / Split Time Comparison",
  component: SplitTimeComparison,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof SplitTimeComparison>;

const milesVsHudson: { driver1: RallycrossRacer; driver2: RallycrossRacer } = {
  driver1: {
    name: "Miles",
    car: "2000 Miata",
    runs: [45.2, 44.8, 45.1, 44.5, 44.9, 45.3, 44.6, 45.0, 44.7, 45.2],
    cones: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 449.3,
  },
  driver2: {
    name: "Hudson",
    car: "1999 Miata",
    runs: [46.1, 45.3, 46.0, 45.8, 45.9, 46.2, 45.7, 46.1, 45.8, 46.0],
    cones: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 454.025,
  },
};

const ianVsDoug: { driver1: RallycrossRacer; driver2: RallycrossRacer } = {
  driver1: {
    name: "Ian",
    car: "Red Bomber Miata",
    runs: [43.5, 44.1, 43.8, 44.0, 43.7, 44.2, 43.9, 44.1, 43.6, 44.0],
    cones: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 439.0,
  },
  driver2: {
    name: "Doug",
    car: "2001 Miata",
    runs: [43.6, 44.1, 43.9, 44.1, 43.9, 44.3, 44.0, 44.1, 43.7, 44.1],
    cones: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 439.015,
  },
};

const ryanVsIan: { driver1: RallycrossRacer; driver2: RallycrossRacer } = {
  driver1: {
    name: "Ryan",
    car: "1973 MG GTS",
    runs: [48.5, 45.8, 46.3, 46.4, 45.2, 46.8, 45.6, 47.6, 47.0, 46.9],
    cones: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    total: 464.1,
  },
  driver2: {
    name: "Ian",
    car: "1990 Mazda Miata",
    runs: [42.9, 43.7, 42.8, 43.2, 42.6, 43.5, 43.0, 43.3, 42.9, 43.1],
    cones: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 431.0,
  },
};

export const MilesVsHudson: Story = {
  args: {
    driver1: milesVsHudson.driver1,
    driver2: milesVsHudson.driver2,
  },
  parameters: {
    docs: {
      description: {
        story: "Miles vs Hudson KCRX E6 — 4.725s over 10 runs, 7 runs to 3",
      },
    },
  },
};

export const IanVsDoug: Story = {
  args: {
    driver1: ianVsDoug.driver1,
    driver2: ianVsDoug.driver2,
    highlight: 1,
  },
  parameters: {
    docs: {
      description: {
        story: "Ian vs Doug KCR Aug 16 — 0.015s, same car, decided on the last run. Simulate near-tie with highlight.",
      },
    },
  },
};

export const RyanVsIan: Story = {
  args: {
    driver1: ryanVsIan.driver1,
    driver2: ryanVsIan.driver2,
  },
  parameters: {
    docs: {
      description: {
        story: "Ryan vs Ian KCRX E6 — 6.639s, Ryan won 9 of 10 runs. Already shipped as a Short.",
      },
    },
  },
};
