import type { Meta, StoryObj } from "@storybook/react-vite";
import { color, type } from "../theme";
import { PageHeading, SectionHeading, RuleNote } from "./Heading";

/**
 * The document-heading grammar, locked 2026-07-28 in `type.heading`.
 *
 * These are for a *document* — a build record, a spec sheet, a README rendered
 * for the web. Not the two-tier thumbnail hero lockup, which is its own thing
 * (brand guide section 05) and is authored per piece.
 */
const meta: Meta = {
  title: "Foundations/Headings",
  parameters: {
    docs: {
      description: {
        component:
          "Page and section headings, rendered from `type.heading` rather than restating it. " +
          "Every value below — case, weight, tracking, line-height and the clamp bounds — is read " +
          "from the token file, so changing `type.heading` changes these components and anything " +
          "built on them.",
      },
    },
  },
};
export default meta;

type Story = StoryObj;

/**
 * The locked page-heading style: all caps, wide Helvetica Bold, positive
 * tracking, and a size that clamps *between two named scale steps* rather than
 * sitting on one. A page heading has to hold from a phone to a desktop, and
 * clamping between steps keeps it on the scale at both ends.
 *
 * Tracking is positive on purpose. Tightening it pulls the heading back toward
 * the condensed look the hero decision rejected.
 */
export const Page: Story = {
  render: () => (
    <PageHeading
      eyebrow="KCRX Event 5 · Modified RWD · 7.19.26"
      standfirst="The standfirst sits at body size in muted, so the heading carries the whole hierarchy on weight and case rather than needing a second accent."
    >
      KCRX Event 5, Build Record
    </PageHeading>
  ),
};

/** Without the optional eyebrow and standfirst — the heading alone. */
export const PageBare: Story = {
  name: "Page — bare",
  render: () => <PageHeading>Seized Bolts and Other Lies</PageHeading>,
};

/**
 * A mono sequence marker in a corner-label box, then the title. This is
 * `type.heading.subheadRule`: the same left-boxed / right-plain grammar as a
 * corner label, so numbered sections read as part of the system rather than as
 * a new device.
 *
 * The marker is a **box, not an accent chip**. Sequence numbers are not a
 * payoff, and the accent is reserved for the thing that is.
 */
export const Section: Story = {
  render: () => (
    <div>
      <SectionHeading seq="01" title="Logo & Badge" />
      <SectionHeading seq="02" title="Color" meta="Pick one core by mood" />
      <SectionHeading seq="03" title="Typography" />
    </div>
  ),
};

/** The meta drops to its own line below 34rem rather than escaping the frame. */
export const SectionNarrow: Story = {
  name: "Section — narrow",
  render: () => (
    <div style={{ width: 320, border: `1px solid ${color.base.line}`, padding: 12 }}>
      <SectionHeading seq="06" title="Layout & Composition" meta="12 rules" />
    </div>
  ),
};

/** A rule paragraph: mono label, then the rule at body size in Steel Light. */
export const Rule: Story = {
  render: () => (
    <div>
      <RuleNote>
        Square corners: every box, label, card, pill and button uses hard right-angle
        corners. The circle brand system is the one exception, and it is always fully
        round, never partially rounded.
      </RuleNote>
      <RuleNote label="One accent">
        Pick Spark or Grit by mood and use exactly one per piece — never two as
        co-headline colours.
      </RuleNote>
      <RuleNote label={`Locked ${type.heading.lockedOn}`}>{type.heading.rule}</RuleNote>
    </div>
  ),
};

/**
 * Why these components restate their own typography inline instead of letting
 * it cascade: a host stylesheet with bare element rules beats plain
 * inheritance. Storybook's docs CSS does exactly that — it put a border under
 * every `h2` and rendered the brand circle's wordmark at 16px in Nunito Sans.
 * The components declare case, weight, family, size and border themselves so
 * they survive being embedded anywhere.
 */
export const HostStyleResistance: Story = {
  name: "Resisting host styles",
  render: () => (
    <div className="sbdocs">
      <style>{`.hostile h2 { border-bottom: 3px solid red; font-family: Comic Sans MS; text-transform: lowercase; }`}</style>
      <div className="hostile">
        <SectionHeading seq="04" title="Corner Labels" meta="Still correct" />
      </div>
    </div>
  ),
};
