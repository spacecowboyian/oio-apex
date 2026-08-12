import React from "react";
import { color, fontStack, type } from "../theme";

/**
 * The locked page-heading style (tokens.json `type.heading`, locked 2026-07-28)
 * and its section-heading companion.
 *
 * Both read every value from the token file rather than restating it, so a
 * change to `type.heading` moves the guide, the video project and any surface
 * using these in one edit. Previously this style existed only as prose in the
 * brand guide HTML and as hand-copied CSS wherever it was needed — the exact
 * drift `@oio/tokens` exists to prevent.
 */

const h = type.heading;

export type PageHeadingProps = {
  children: React.ReactNode;
  /** Optional standfirst: body size, muted, so the heading carries the whole
   *  hierarchy on weight and case rather than needing a second accent. */
  standfirst?: React.ReactNode;
  /** Optional eyebrow above the heading — mono, muted, all caps. */
  eyebrow?: React.ReactNode;
};

export const PageHeading: React.FC<PageHeadingProps> = ({ children, standfirst, eyebrow }) => (
  <header>
    {eyebrow && (
      <p
        style={{
          fontFamily: fontStack("mono"),
          fontSize: type.scale.caption,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.base.muted,
          margin: `0 0 ${type.scale.caption}`,
        }}
      >
        {eyebrow}
      </p>
    )}
    <h1
      style={{
        fontFamily: fontStack(h.font as "helvetica"),
        fontWeight: h.weight,
        textTransform: h.case as "uppercase",
        letterSpacing: h.letterSpacing,
        lineHeight: h.lineHeight,
        // Fluid between two named steps — never a fixed step, never an ad-hoc
        // size. A page heading has to hold from a phone to a desktop.
        fontSize: `clamp(${type.scale[h.sizeMin as "h3"]}, ${h.sizePreferred}, ${
          type.scale[h.sizeMax as "h1"]
        })`,
        textWrap: h.balance ? "balance" : undefined,
        color: color.base.white,
        margin: 0,
      }}
    >
      {children}
    </h1>
    {standfirst && (
      <p
        style={{
          fontFamily: fontStack("helvetica"),
          fontSize: type.scale.body,
          lineHeight: 1.5,
          color: color.base.muted,
          maxWidth: "60ch",
          marginTop: type.scale.body,
        }}
      >
        {standfirst}
      </p>
    )}
  </header>
);

export type SectionHeadingProps = {
  /** Sequence marker — rendered in the corner-label box. */
  seq: string;
  title: string;
  /** Optional right-aligned meta; drops to its own line on narrow viewports. */
  meta?: string;
};

/**
 * A mono sequence marker in a corner-label box, then the title. Reuses the
 * corner-label grammar (left boxed and contrasting, right plain) so numbered
 * sections read as part of the system rather than a new device.
 *
 * The marker is a *box*, not an accent chip — sequence numbers are not a payoff.
 */
export const SectionHeading: React.FC<SectionHeadingProps> = ({ seq, title, meta }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.75rem",
      paddingBottom: "0.75rem",
      borderBottom: `1px solid ${color.base.line}`,
      marginTop: "3.5rem",
      marginBottom: "1.5rem",
    }}
  >
    <span
      style={{
        fontFamily: fontStack("mono"),
        fontSize: type.scale.caption,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        // Contrast-matched to its own ground, same as a corner label's box.
        background: color.base.white,
        color: color.base.black,
        padding: "0.32em 0.55em",
      }}
    >
      {seq}
    </span>
    <h2
      style={{
        fontFamily: fontStack("helvetica"),
        fontSize: type.scale.h6,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        textTransform: "uppercase",
        color: color.base.white,
        margin: 0,
      }}
    >
      {title}
    </h2>
    {meta && (
      <span
        style={{
          marginLeft: "auto",
          fontFamily: fontStack("mono"),
          fontSize: type.scale.caption,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: color.base.muted,
        }}
      >
        {meta}
      </span>
    )}
  </div>
);

/**
 * A rule paragraph. The guide's recurring "Rules" block: a mono label, then the
 * rule text at body size in muted — never Steel, which fails AA for body text
 * on every Apex ground.
 */
export const RuleNote: React.FC<{ label?: string; children: React.ReactNode }> = ({
  label = "Rule",
  children,
}) => (
  <p
    style={{
      fontFamily: fontStack("helvetica"),
      fontSize: type.scale.body,
      lineHeight: 1.5,
      color: color.base.muted,
      maxWidth: "70ch",
      margin: "1rem 0",
    }}
  >
    <span
      style={{
        fontFamily: fontStack("mono"),
        fontSize: type.scale.caption,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color.base.white,
        marginRight: "0.75em",
      }}
    >
      {label}
    </span>
    {children}
  </p>
);
