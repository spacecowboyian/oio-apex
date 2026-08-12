/* eslint-disable @remotion/no-string-assets, @remotion/warn-native-media-tag --
   Both rules exist for Remotion compositions, where a still has to be decoded
   before the frame is captured and assets must resolve through staticFile().
   This is a Storybook docs page that never enters a render, and the six images
   are the guide's own reference photos served from public/. */
import React from "react";
import { color, type as typeTokens } from "../theme";
import "./apex-guide.css";

/**
 * The Apex brand guide.
 *
 * Markup and styling are the standalone oio-apex-brand-guide.html (removed
 * 2026-08-11), ported so the guide keeps exactly the look it had. What changed
 * is where the values come from: the guide used to restate every hex, rgb pair
 * and type step in its own markup, and tokens.json recorded that the mirror had
 * drifted before. Every brand value below is now read from @oio/tokens.
 *
 * Four literals survive because they are not brand values and have no token:
 * #171310 (the photo-mock gradient), #c7ccd1 and #eceef0 (the light-UI mock),
 * and #e9e5de (inline emphasis). Anything that documents the system reads from
 * the token file.
 *
 * The circles keep the guide's own `.brand-circle` markup rather than the
 * BrandCircle component. The two are behaviourally identical — same 0.36/0.533/
 * 0.689/0.644 glyph ratios and same optical-centring offsets, verified against
 * the original CSS — but the guide sizes them by inheriting `--d` from layout
 * wrappers and positions two of them absolutely, which the component's explicit
 * `diameter` prop would have to re-plumb. Worth reconciling; see HANDOFF.
 */

/** The `rgb(...)` pair the guide prints beside each hex, derived rather than typed. */
const rgbOf = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** "1.375rem · 22px" — both halves computed from the one scale value. */
const scaleLabel = (step: keyof typeof typeTokens.scale) => {
  const rem = typeTokens.scale[step];
  return `${rem} · ${Math.round(parseFloat(rem) * 16)}px`;
};

/**
 * The custom properties the ported stylesheet reads. The original declared
 * these in `:root` as literals; here they are the token values, so the guide
 * cannot show a colour or a size the system does not actually define.
 */
const cssVars = {
  "--black": color.base.black,
  "--surface": color.base.surface,
  "--surface-2": color.base.surface2,
  "--white": color.base.white,
  "--grit": color.core.grit.ramp[500],
  "--spark": color.core.spark.ramp[500],
  "--rust": color.support.rust.ramp[500],
  "--flag": color.support.flag.ramp[500],
  "--line": color.base.line,
  "--muted": color.base.muted,
  "--muted-2": color.base.muted2,
  "--size-caption": typeTokens.scale.caption,
  "--size-body": typeTokens.scale.body,
  "--size-h6": typeTokens.scale.h6,
  "--size-h5": typeTokens.scale.h5,
  "--size-h4": typeTokens.scale.h4,
  "--size-h3": typeTokens.scale.h3,
  "--size-h2": typeTokens.scale.h2,
  "--size-h1": typeTokens.scale.h1,
  "--size-hero-sm": typeTokens.scale.heroSm,
  "--size-hero-md": typeTokens.scale.heroMd,
  "--size-hero-lg": typeTokens.scale.heroLg,
  "--size-hero-xl": typeTokens.scale.heroXl,
} as React.CSSProperties;

export const ApexGuide: React.FC = () => (
  /* `sb-unstyled` is Storybook's own opt-out: its docs stylesheet wraps every
     element rule in `:where(:not(.sb-unstyled, .sb-unstyled *))`, so this drops
     the whole subtree out of docs styling instead of fighting it on
     specificity. Without it the guide inherits Nunito Sans everywhere the
     original inherited Helvetica from `body`. */
  <div className="apex-guide sb-unstyled" style={cssVars}>
      <div className="sheet">

        <div className="masthead">
          <div className="masthead-top">
            <div className="oio-badge">
              <div className="ring">OIO</div>
              <div className="label">Racing — Brand Style Guide</div>
            </div>
          </div>
          <div className="style-name display">Apex<span className="accent">.</span></div>
          <p className="tagline">The point of a corner where you commit hardest — where the struggle to get there
            turns into the payoff coming out. <b>Grit going in, spark coming out.</b>{" "}
            One accent per piece, picked by mood.</p>
          <div className="stripe">
            <span style={{ background: "var(--spark)" }}></span>
            <span style={{ background: "var(--grit)" }}></span>
            <span style={{ background: "var(--rust)" }}></span>
          </div>
          <div className="stripe-cap">Spark · Grit · Rust — the house stripe, TRD-inspired. DALE, GOBLIN, FX and MGB-GTS are all Toyotas.</div>
        </div>

        <section style={{ marginTop: "3rem" }}>
          <h2 className="eyebrow">01 — Logo &amp; Badge</h2>

          <details className="rules"><summary>Rules</summary>

            <p className="specimen-body" style={{ marginBottom: "0.9rem" }}>Wordmark: Helvetica Bold, tight tracking,
            all-caps "OIO" — straight off the source lockup, no circle, no outline. Badge: solid fill only —
            <b style={{ color: "#e9e5de" }}>never an outlined ring.</b> Always contrast-matched to the surface behind
            it — black circle + white text on light backgrounds, white circle + black text on dark backgrounds.
            Neither is a default; pick whichever one actually contrasts. Black circle/white text is the one seen
            most often in the wild (stickers, apparel — both usually on a light substrate).</p>

          </details>

          <div className="badge-row">
            <div className="badge-item">
              <span className="logo-word">OIO</span>
              <div className="cap">Wordmark</div>
            </div>
            <div className="badge-item">
              <div className="badge-demo on-black"><span>OIO</span></div>
              <div className="cap">Black · white text</div>
            </div>
            <div className="badge-item">
              <div className="badge-demo on-white"><span>OIO</span></div>
              <div className="cap">White · black text</div>
            </div>
            <div className="badge-item">
              <div className="badge-wrap">
                <div className="badge-demo wrong"><span>OIO</span></div>
                <div className="strike"></div>
              </div>
              <div className="cap" style={{ color: "var(--grit)" }}>Never: outlined ring</div>
            </div>
          </div>

          <div className="subhead">The circle is a brand system</div>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ marginBottom: "0.2rem" }}>The OIO badge is one instance of a bigger idea:
            the <b style={{ color: "#e9e5de" }}>solid circle</b> is a core brand shape. It carries the wordmark, but it
            also holds <b style={{ color: "#e9e5de" }}>connector words</b> (or / vs / to), an <b style={{ color: "#e9e5de" }}>ampersand</b>,
            or a <b style={{ color: "#e9e5de" }}>number</b> — anywhere two things need joining or a mark needs to sit apart
            from the type. Always solid fill, never an outlined ring — same rule as the badge. Same contrast rule
            too: black circle + white text on light, white circle + black text on dark — whichever one contrasts,
            not a fixed default.</p>
          </details>
          <div className="circle-suite">
            <div className="circle-el">
              <div className="circle-stage"><div className="brand-circle wordmark"><span>OIO</span></div></div>
              <div className="cap">Wordmark</div>
            </div>
            <div className="circle-el">
              <div className="circle-stage light"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
              <div className="cap">Invert — light only</div>
            </div>
            <div className="circle-el">
              <div className="circle-stage"><div className="brand-circle connector"><span>or</span></div></div>
              <div className="cap">Connector</div>
            </div>
            <div className="circle-el">
              <div className="circle-stage"><div className="brand-circle connector"><span>vs</span></div></div>
              <div className="cap">Connector</div>
            </div>
            <div className="circle-el">
              <div className="circle-stage"><div className="brand-circle amp"><span>&amp;</span></div></div>
              <div className="cap">Ampersand</div>
            </div>
            <div className="circle-el">
              <div className="circle-stage"><div className="brand-circle num"><span>2</span></div></div>
              <div className="cap">Number</div>
            </div>
          </div>

          <details className="rules"><summary>Rules</summary>

            <p className="specimen-body" style={{ fontSize: "0.86rem", color: "var(--muted)", marginTop: "1.4rem", marginBottom: "0.2rem" }}>
            The circle is one fixed, centred unit. To resize, <b style={{ color: "#e9e5de" }}>scale the whole thing</b> —
            one <code className="mono" style={{ color: "#e9e5de" }}>--d</code> (diameter) value drives circle, glyph size, and
            the frozen optical-centring offset together. Never re-tune the text, padding, or line-height per size; it
            stays centred at any scale.</p>

          </details>
          <div className="circle-suite" style={{ alignItems: "flex-end" }}>
            <div className="circle-el" style={{ "--d": "40px" } as React.CSSProperties}>
              <div className="circle-stage"><div className="brand-circle wordmark"><span>OIO</span></div></div>
              <div className="cap">--d: 40px</div>
            </div>
            <div className="circle-el" style={{ "--d": "72px" } as React.CSSProperties}>
              <div className="circle-stage"><div className="brand-circle wordmark"><span>OIO</span></div></div>
              <div className="cap">--d: 72px</div>
            </div>
            <div className="circle-el" style={{ "--d": "116px" } as React.CSSProperties}>
              <div className="circle-stage"><div className="brand-circle wordmark"><span>OIO</span></div></div>
              <div className="cap">--d: 116px</div>
            </div>
            <div className="circle-el" style={{ "--d": "116px" } as React.CSSProperties}>
              <div className="circle-stage"><div className="brand-circle amp"><span>&amp;</span></div></div>
              <div className="cap">--d: 116px</div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section>
          <h2 className="eyebrow">02 — Color</h2>

          <div className="subhead">Core accents — pick one by mood</div>
          <div className="swatch-grid">
            <div className="swatch">
              <div className="chip" style={{ background: "var(--spark)" }}></div>
              <div className="name"><span className="rank">01</span> Spark (Yellow)</div>
              <div className="role">Victory, fun, surprise, the payoff. Ignition, the win, the reveal. Fill text: black.</div>
              <div className="codes mono"><span>{color.core.spark.ramp[500]}</span><span>{rgbOf(color.core.spark.ramp[500])}</span></div>
                        <div className="ramp-strip">
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.spark.ramp[100] }}></div><div className="lbl">100</div><div className="hex mono">{color.core.spark.ramp[100]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.spark.ramp[300] }}></div><div className="lbl">300</div><div className="hex mono">{color.core.spark.ramp[300]}</div></div>
                  <div className="ramp-step base"><div className="chip" style={{ background: color.core.spark.ramp[500] }}></div><div className="lbl">500 · base</div><div className="hex mono">{color.core.spark.ramp[500]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.spark.ramp[700] }}></div><div className="lbl">700</div><div className="hex mono">{color.core.spark.ramp[700]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.spark.ramp[900] }}></div><div className="lbl">900</div><div className="hex mono">{color.core.spark.ramp[900]}</div></div>
                </div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--grit)" }}></div>
              <div className="name"><span className="rank">02</span> Grit (Red)</div>
              <div className="role">Mechanical, gritty, drama, the struggle — the heat, the edge, the limit you push to. Fill text: white.</div>
              <div className="codes mono"><span>{color.core.grit.ramp[500]}</span><span>{rgbOf(color.core.grit.ramp[500])}</span></div>
                        <div className="ramp-strip">
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.grit.ramp[100] }}></div><div className="lbl">100</div><div className="hex mono">{color.core.grit.ramp[100]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.grit.ramp[300] }}></div><div className="lbl">300</div><div className="hex mono">{color.core.grit.ramp[300]}</div></div>
                  <div className="ramp-step base"><div className="chip" style={{ background: color.core.grit.ramp[500] }}></div><div className="lbl">500 · base</div><div className="hex mono">{color.core.grit.ramp[500]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.grit.ramp[700] }}></div><div className="lbl">700</div><div className="hex mono">{color.core.grit.ramp[700]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.core.grit.ramp[900] }}></div><div className="lbl">900</div><div className="hex mono">{color.core.grit.ramp[900]}</div></div>
                </div>
            </div>
          </div>
          <div className="accent-rule">
            <div className="cell spark"><b>Spark rule</b>Fun, victory, a surprise reveal. Default first.</div>
            <div className="cell grit"><b>Grit rule</b>Mechanical, gritty, a problem being solved — was orange, now red. One accent per piece — never two as co-headline colors.</div>
          </div>

          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ fontSize: "0.86rem", color: "var(--muted)", marginBottom: "0" }}>
            Same mix ratio for every color, so the ramps stay visually consistent: <b style={{ color: "#e9e5de" }}>100/300</b>
            mix the base 80%/40% toward white, <b style={{ color: "#e9e5de" }}>500</b> is the base hex unchanged,
            <b style={{ color: "#e9e5de" }}>700/900</b> mix 35%/65% toward black. Use 700 for hover/pressed states and
            900 for a low-opacity wash on black.
          </p>
          </details>

          <div className="subhead">Support accents — Rust &amp; Flag</div>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ fontSize: "0.86rem", color: "var(--muted)", marginBottom: "0.9rem" }}>
            Neither is a mood pick like Spark/Grit — per Impeccable's color guidance, semantic/state color
            stays separate from brand accents. Rust is texture (vintage). Flag is a status signal
            (confirmed/priced), not a headline color.
          </p>
          </details>
          <div className="swatch-grid">
            <div className="swatch">
              <div className="chip" style={{ background: "var(--rust)" }}></div>
              <div className="name">Rust (Orange)</div>
              <div className="role">Patina, vintage, warmth — the old-Toyota color. Layer it under or alongside a primary accent; don't run it alone as the punch color.</div>
              <div className="codes mono"><span>{color.support.rust.ramp[500]}</span><span>{rgbOf(color.support.rust.ramp[500])}</span></div>
                        <div className="ramp-strip">
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.rust.ramp[100] }}></div><div className="lbl">100</div><div className="hex mono">{color.support.rust.ramp[100]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.rust.ramp[300] }}></div><div className="lbl">300</div><div className="hex mono">{color.support.rust.ramp[300]}</div></div>
                  <div className="ramp-step base"><div className="chip" style={{ background: color.support.rust.ramp[500] }}></div><div className="lbl">500 · base</div><div className="hex mono">{color.support.rust.ramp[500]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.rust.ramp[700] }}></div><div className="lbl">700</div><div className="hex mono">{color.support.rust.ramp[700]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.rust.ramp[900] }}></div><div className="lbl">900</div><div className="hex mono">{color.support.rust.ramp[900]}</div></div>
                </div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--flag)" }}></div>
              <div className="name">Flag (Green)</div>
              <div className="role">Confirmation and pricing only — order placed, payment cleared, spot confirmed. A status signal, not a mood to pick for a headline.</div>
              <div className="codes mono"><span>{color.support.flag.ramp[500]}</span><span>{rgbOf(color.support.flag.ramp[500])}</span></div>
                        <div className="ramp-strip">
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.flag.ramp[100] }}></div><div className="lbl">100</div><div className="hex mono">{color.support.flag.ramp[100]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.flag.ramp[300] }}></div><div className="lbl">300</div><div className="hex mono">{color.support.flag.ramp[300]}</div></div>
                  <div className="ramp-step base"><div className="chip" style={{ background: color.support.flag.ramp[500] }}></div><div className="lbl">500 · base</div><div className="hex mono">{color.support.flag.ramp[500]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.flag.ramp[700] }}></div><div className="lbl">700</div><div className="hex mono">{color.support.flag.ramp[700]}</div></div>
                  <div className="ramp-step"><div className="chip" style={{ background: color.support.flag.ramp[900] }}></div><div className="lbl">900</div><div className="hex mono">{color.support.flag.ramp[900]}</div></div>
                </div>
            </div>
          </div>

          <div className="subhead">Neutrals — ground &amp; text</div>
          <div className="swatch-grid">
            <div className="swatch">
              <div className="chip" style={{ background: "var(--black)" }}></div>
              <div className="name">OIO Black</div>
              <div className="role">Primary ground. Pill and badge backgrounds, logo circle. Black is home base.</div>
              <div className="codes mono"><span>{color.neutral.black}</span><span>{rgbOf(color.neutral.black)}</span></div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--white)" }}></div>
              <div className="name">OIO White</div>
              <div className="role">Primary text on black. Supporting/setup words in headlines.</div>
              <div className="codes mono"><span>{color.neutral.white}</span><span>{rgbOf(color.neutral.white)}</span></div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}></div>
              <div className="name">Dark Gray</div>
              <div className="role">Text on light grounds, subtle shadows. Support color, rare use.</div>
              <div className="codes mono"><span>{color.neutral.gray900}</span><span>{rgbOf(color.neutral.gray900)}</span></div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: color.neutral.gray100 }}></div>
              <div className="name">Light Gray</div>
              <div className="role">Alternative ground. Very rare — black is still the default.</div>
              <div className="codes mono"><span>{color.neutral.gray100}</span><span>{rgbOf(color.neutral.gray100)}</span></div>
            </div>
          </div>

          <div className="subhead">UI neutrals — text/border scale (new)</div>
          <div className="swatch-grid">
            <div className="swatch">
              <div className="chip" style={{ background: "var(--muted)" }}></div>
              <div className="name">Steel Light</div>
              <div className="role">Muted labels, eyebrows, section markers — <b style={{ color: "#e9e5de" }}>and all
              secondary body text</b>. 5.85:1 on Surface.</div>
              <div className="codes mono"><span>{color.neutral.muted}</span></div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--muted-2)" }}></div>
              <div className="name">Steel</div>
              <div className="role"><b style={{ color: "#e9e5de" }}>Not body text.</b> Large text (24px+), disabled
              states, decorative fills. 3.10:1 on Surface — passes AA for large text only, and fails outright
              on Surface 2 at 2.89:1.</div>
              <div className="codes mono"><span>{color.neutral.muted2}</span></div>
            </div>
            <div className="swatch">
              <div className="chip" style={{ background: "var(--line)" }}></div>
              <div className="name">Steel Dark</div>
              <div className="role">Dividers, borders, hairlines.</div>
              <div className="codes mono"><span>{color.neutral.line}</span></div>
            </div>
          </div>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.8rem" }}>Warm-biased, not neutral gray — leans the same direction as the accents so it reads as chosen.</p>
          </details>

        </section>

        <hr className="rule" />

        <section>
          <h2 className="eyebrow">03 — Typography</h2>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ marginBottom: "0.4rem", color: "var(--muted)" }}>The type suite — two
            Helvetica cuts and one vintage script, on one shared scale. Regular/Bold carries every size,
            <b style={{ color: "#e9e5de" }}>display included</b>; SignPainter only ever goes loud, and Condensed
            Black is now numerals-only.</p>
            <p className="specimen-body" style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "1rem" }}>
            One scale, rem-based, ~1.25 ratio hand-rounded to clean values — named after HTML elements through
            h1, then <span className="mono" style={{ color: "#e9e5de" }}>hero-[t-shirt size]</span> beyond it. Every size
            below is one of these twelve steps; nothing is picked ad hoc.
          </p>
            <p className="specimen-body" style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "1rem" }}>
            <b style={{ color: "#e9e5de" }}>Page headings (locked 2026-07-28).</b> The heading style for a
            <i style={{ fontStyle: "normal", color: "#e9e5de" }}>document</i> — a build record, a spec sheet, a README
            rendered for the web. Not the two-tier thumbnail hero lockup, which stays section 05's job.
            <b style={{ color: "#e9e5de" }}>All caps, wide Helvetica Bold</b>, weight 700, letter-spacing
            <span className="mono" style={{ color: "#e9e5de" }}>+0.01em</span>, line-height
            <span className="mono" style={{ color: "#e9e5de" }}>1.04</span>, balanced wrap. Size is
            <b style={{ color: "#e9e5de" }}>fluid between two named steps</b> —
            <span className="mono" style={{ color: "#e9e5de" }}>clamp(h3, 7vw, h1)</span> — never a fixed step and never
            an ad-hoc size, because a page heading has to hold from a phone to a desktop and clamping between
            scale steps keeps it on the scale at both ends. Tracking is
            <b style={{ color: "#e9e5de" }}>positive, not negative</b>: tightening it pulls the heading back toward
            the condensed look the hero decision rejected. A numbered section heading pairs a mono sequence
            marker in a corner-label box with the title, so it reads as the existing grammar rather than a new
            device. Values live in <span className="mono" style={{ color: "#e9e5de" }}>tokens.json</span> under
            <span className="mono" style={{ color: "#e9e5de" }}>type.heading</span>.
          </p>
          </details>

          <div className="subhead">Page heading</div>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", padding: "1.6rem 1.4rem", marginBottom: "1.6rem" }}>
            <div style={{ display: "flex", fontSize: "0.72rem", fontWeight: "700", letterSpacing: "0.14em", marginBottom: "0.9rem" }}>
              <span style={{ background: "#fff", color: "#000", padding: "0.32em 0.55em" }}>KCRX EVENT 5 · MODIFIED RWD</span>
              <span style={{ color: "#fff", padding: "0.32em 0.55em", border: "1px solid var(--line)", borderLeft: "0" }}>7.19.26</span>
            </div>
            <div className="font-helv" style={{ fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.01em", lineHeight: "1.04", fontSize: "clamp(2.25rem, 7vw, 3.625rem)" }}>KCRX Event 5,<br />Build record</div>
            <p className="specimen-body" style={{ color: "var(--muted)", marginTop: "0.9rem", maxWidth: "40em" }}>The
            standfirst sits at body size in muted, so the heading carries the whole hierarchy on weight and
            case rather than needing a second accent.</p>
          </div>

          <p className="specimen-body" style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: "0.6rem" }}>At a glance</p>
          <div className="font-summary-row">
            <div className="font-summary-card">
              <div className="suite-mark">
                <span className="glyph font-helv" style={{ fontWeight: "700" }}>Aa</span>
                <span className="tag">Grotesque sans</span>
              </div>
              <div className="fname">Helvetica</div>
              <div className="frole">Lead / body</div>
            </div>

            <div className="font-summary-card">
              <div className="suite-mark">
                <span className="glyph display">Aa</span>
                <span className="tag">Condensed numerals</span>
              </div>
              <div className="fname">Condensed Black</div>
              <div className="frole">Numerals only</div>
            </div>

            <div className="font-summary-card">
              <div className="suite-mark">
                <span className="glyph font-sign">Aa</span>
                <span className="tag">Vintage script</span>
              </div>
              <div className="fname">SignPainter</div>
              <div className="frole">Hero only</div>
            </div>
          </div>

          <div className="tabs">
            {/* defaultChecked, not checked: React treats a bare `checked` as a
                 controlled value with no onChange, which freezes the tab and
                 logs a warning. The original was plain HTML, where `checked`
                 is just the initial state — defaultChecked is that. */}
            <input type="radio" name="type-tabs" id="tab-helv" defaultChecked />
            <input type="radio" name="type-tabs" id="tab-cond" />
            <input type="radio" name="type-tabs" id="tab-sign" />
            <div className="tab-labels">
              <label htmlFor="tab-helv">Helvetica</label>
              <label htmlFor="tab-cond">Condensed Black</label>
              <label htmlFor="tab-sign">SignPainter</label>
            </div>

            <div className="tab-panel panel-helv">
              <div className="type-suite-card" style={{ border: "none", margin: "0", padding: "0" }}>
                <div className="suite-mark">
                  <span className="glyph font-helv" style={{ fontWeight: "700" }}>Aa</span>
                  <span className="tag">Grotesque sans</span>
                </div>
                <div>
                  <div className="meta">
                    <span className="role-name">Lead / body — everything long-form</span>
                    <span className="font-name mono">Helvetica</span>
                  </div>
                  <details className="rules"><summary>Rules</summary>
                    <p className="specimen-body">Helvetica is the lead font — the historical OIO workhorse. Body copy,
                    labels, captions, UI, pill text, anything long-form or set small. Neutral, clean, reliable.
                    If a piece isn't a display headline, it's Helvetica.</p>
                  </details>

                  <div className="suite-weights">
                    <div className="w"><span className="lbl">Regular</span><span className="sample font-helv" style={{ fontWeight: "400" }}>OIO Racing</span></div>
                    <div className="w"><span className="lbl">Bold</span><span className="sample font-helv" style={{ fontWeight: "700" }}>OIO Racing</span></div>
                  </div>

                  <div className="type-scale">
                    <div className="type-scale-row">
                      <div className="size-tag">Caption<b>{scaleLabel("caption")}</b></div>
                      <div className="sample font-helv" style={{ fontSize: "var(--size-caption)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.09em" }}>1972 CELICA · DALE</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">Body<b>{scaleLabel("body")}</b></div>
                      <div className="sample font-helv" style={{ fontSize: "var(--size-body)" }}>Helvetica is the lead font — the historical OIO workhorse.</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">H5<b>{scaleLabel("h5")}</b></div>
                      <div className="sample font-helv" style={{ fontSize: "var(--size-h5)", fontWeight: "700" }}>Support accents — Rust &amp; Flag</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">H3<b>{scaleLabel("h3")}</b></div>
                      <div className="sample font-helv" style={{ fontSize: "var(--size-h3)", fontWeight: "700" }}>OIO Racing</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-panel panel-cond">
              <div className="type-suite-card" style={{ border: "none", margin: "0", padding: "0" }}>
                <div className="suite-mark">
                  <span className="glyph display">Aa</span>
                  <span className="tag">Condensed display</span>
                </div>
                <div>
                  <div className="meta">
                    <span className="role-name">Display — the punch only</span>
                    <span className="font-name mono">Helvetica Neue Condensed Black</span>
                  </div>
                  <details className="rules"><summary>Rules</summary>
                    <p className="specimen-body" style={{ marginBottom: "0.8rem" }}>Same family as the body face, different cut
                    — tall, condensed, all-caps, reserved for the one word that shouts. Regular and Bold aren't
                    condensed or heavy enough to read as the megaphone from a phone screen; Condensed Black is.
                    Tight leading, 80–90% of font size. Never below H2 — that floor is the rule.</p>
                  </details>

                  <div className="suite-weights">
                    <div className="w"><span className="lbl">Condensed Black — the only cut used</span><span className="sample display" style={{ fontSize: "1.3rem" }}>Grit</span></div>
                  </div>

                  <div className="type-scale">
                    <div className="type-scale-row">
                      <div className="size-tag">H2<b>{scaleLabel("h2")}</b></div>
                      <div className="sample display" style={{ fontSize: "var(--size-h2)" }}>Grit</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">H1<b>{scaleLabel("h1")}</b></div>
                      <div className="sample display" style={{ fontSize: "var(--size-h1)" }}>Grit</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">Hero SM<b>{scaleLabel("heroSm")}</b></div>
                      <div className="sample display" style={{ fontSize: "var(--size-hero-sm)" }}>Grit</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tab-panel panel-sign">
              <div className="type-suite-card" style={{ border: "none", margin: "0", padding: "0" }}>
                <div className="suite-mark">
                  <span className="glyph font-sign">Aa</span>
                  <span className="tag">Vintage script</span>
                </div>
                <div>
                  <div className="meta">
                    <span className="role-name">Vintage sub-face — hero sizes only</span>
                    <span className="font-name mono">SignPainter</span>
                  </div>
                  <details className="rules"><summary>Rules</summary>
                    <p className="specimen-body">Sourced from the <b style={{ color: "#e9e5de" }}>Redline Revival</b> thumbnail.
                    Never body copy, captions, or labels — hero sizes only, full stop. Nothing below Hero LG (120px)
                    ever ships. Spark yellow is the common case; Rust orange reads more patina/vintage.</p>
                  </details>

                  <div className="suite-weights">
                    <div className="w"><span className="lbl">HouseScript — the only weight used</span><span className="sample font-sign" style={{ fontSize: "1.3rem" }}>Revival</span></div>
                  </div>

                  <div className="type-scale">
                    <div className="type-scale-row">
                      <div className="size-tag">Hero LG<b>{scaleLabel("heroLg")}</b></div>
                      <div className="sample font-sign" style={{ fontSize: "var(--size-hero-lg)", color: "var(--rust)" }}>Revival</div>
                    </div>
                    <div className="type-scale-row">
                      <div className="size-tag">Hero XL<b>{scaleLabel("heroXl")}</b></div>
                      <div className="sample font-sign" style={{ fontSize: "var(--size-hero-xl)", color: "var(--spark)" }}>Revival</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section>
          <h2 className="eyebrow">04 — Corner Labels</h2>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ marginBottom: "0.4rem" }}>Sits in the corner of a thumbnail or video
            overlay to identify the car or event at a glance — always fact first, then the name, so it reads
            the same way every time whether it's a build update or an event recap. Drop it wherever there's
            clear space in the frame, usually a top or bottom corner, clear of the subject. The boxed side
            always pops against its own frame; the plain side just matches it — dark shot, dark shot, light
            shot, light shot.</p>
          </details>
          <div className="label-row">
            <div className="label-frame dark">
              <span className="corner-label">
                <span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": `linear-gradient(180deg, ${color.neutral.black} 0%, #171310 100%)` } as React.CSSProperties}>1985 MR2</span></span><span className="cl-part cl-plain">GOBLIN</span>
              </span>
              <span className="corner-label right">
                <span className="cl-part cl-plain">AUTOCROSS</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": `linear-gradient(180deg, ${color.neutral.black} 0%, #171310 100%)` } as React.CSSProperties}>KCRSCCA</span></span>
              </span>
            </div>
            <div className="label-frame light">
              <span className="corner-label">
                <span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "linear-gradient(180deg, #c7ccd1 0%, #eceef0 100%)" } as React.CSSProperties}>1985 MR2</span></span><span className="cl-part cl-plain">GOBLIN</span>
              </span>
              <span className="corner-label right">
                <span className="cl-part cl-plain">AUTOCROSS</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "linear-gradient(180deg, #c7ccd1 0%, #eceef0 100%)" } as React.CSSProperties}>KCRSCCA</span></span>
              </span>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section>
          <h2 className="eyebrow">05 — Hero Text</h2>
          <details className="rules"><summary>Rules</summary>
            <p className="specimen-body" style={{ marginBottom: "0.4rem" }}>The two-tier headline move, pulled straight
            from the thumbnail archive in <code className="mono" style={{ color: "var(--muted-2)" }}>refs/thumbexamples</code>.
            Three rules the real footage follows every time: <b style={{ color: "#e9e5de" }}>(1)</b> a translucent black
            box carries the text — the photo reads through it faintly; <b style={{ color: "#e9e5de" }}>(2)</b> both tiers
            are <b style={{ color: "#e9e5de" }}>one heavy face split by colour</b> — the wide Helvetica Bold/Black cut, one
            line white, one line the mood accent, never two different fonts; <b style={{ color: "#e9e5de" }}>(3)</b> the
            first row and second row are <b style={{ color: "#e9e5de" }}>flush edge-to-edge</b> — the tip of the top
            word's first letter aligns exactly with the tip of the bottom word's first letter, and their last
            letters end exactly together on the right, with <b style={{ color: "#e9e5de" }}>zero pixel overhang</b>
            either side. Font-size alone can't do this — differing letterform side-bearings (e.g. a rounded
            "S" vs. a flat "T") mean the two words also need a small horizontal nudge (`transform: translateX()`)
            to bring the left edges flush before sizing closes the right edge. Never a fixed small/large ratio,
            and a connector circle in the top row counts toward that row's edge-to-edge span. One accent per
            piece, picked by mood; never two as co-headline colours.</p>
          </details>

          <div className="subhead">Spark · Grit</div>
          <div className="hero-row">
            <div className="hero-cell">
              <div className="hero-cap">Spark</div>
              <div className="hero-frame">
                <div className="hero-box">
                  <span className="hero-line wide white" style={{ fontSize: "30cqw" }}>FIRST</span>
                  <span className="hero-line wide spark" style={{ fontSize: "27cqw" }}>START</span>
                </div>
              </div>
            </div>
            <div className="hero-cell">
              <div className="hero-cap">Grit</div>
              <div className="hero-frame">
                <div className="hero-box">
                  <span className="hero-line wide grit" style={{ fontSize: "37.5cqw" }}>DIRT</span>
                  <span className="hero-line wide white" style={{ fontSize: "21.6cqw" }}>PROOF?</span>
                </div>
              </div>
            </div>
          </div>

          <div className="subhead">Connected · Vintage</div>
          <div className="hero-row">
            <div className="hero-cell">
              <div className="hero-cap">Connected</div>
              <div className="hero-frame">
                <div className="hero-box none">
                  <span className="hero-line wide spark" style={{ fontSize: "25cqw", position: "relative", zIndex: "1" }}>DEAD</span>
                  <span className="hero-line wide white" style={{ fontSize: "30cqw", position: "relative", zIndex: "1" }}>ALIVE</span>
                  {/* connector circle: level 2, overlapping the words; left edge over
                       the last D of DEAD. Absolute so it can sit across the two lines. */}
                  <span className="brand-circle connector" style={{ "--d": "17cqw", position: "absolute", zIndex: "2", left: "74.8%", top: "14%", transform: "rotate(17deg)" } as React.CSSProperties}><span>or</span></span>
                </div>
              </div>
            </div>
            <div className="hero-cell">
              <div className="hero-cap">Vintage</div>
              <div className="hero-frame">
                {/* Reusable vintage lockup: a tab + an outlined script + a gradient
                     fill, layered by z-index (tab behind, script outline + fill in
                     front). Positioning is per-word-set — nudge the tab's top/left to
                     fit whatever the two words are; z-index does the overlap. */}
                <div className="hero-box none" style={{ justifyContent: "center", alignItems: "center", gap: "0" }}>
                  <span className="vin-stack" style={{ fontSize: "41cqw", transform: "translate(-0.058em, 0.055em)" }}>
                    <span className="hero-vin-chip" style={{ fontSize: "8.5cqw", top: "7%", left: "30%" }}>REDLINE</span>
                    <span className="hero-vin-script vin-back">Revival</span>
                    <span className="hero-vin-script vin-front">Revival</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section>
          <h2 className="eyebrow">06 — Layout &amp; Composition</h2>

          <div className="subhead">YouTube Thumbnail</div>
          <div className="zone-diagram">
            <img className="z-bg" src="/betty-outpainted.png" alt="Betty, a 1972 Datsun 521 pickup with a camper shell, loaded on a trailer, under a wide cloudy sky" />
            <div className="z-vignette"></div>
            <div className="z-hero">
              <span className="hero-line wide white" style={{ fontSize: "10.4cqw" }}>TRUCK</span>
              <span className="hero-line wide spark" style={{ fontSize: "11.69cqw", transform: "translateX(-1.2px)" }}>STUFF</span>
            </div>
            <span className="z-corner corner-label right on-dark">
              <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-outpainted.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
            </span>
          </div>
          <details className="rules"><summary>Rules</summary>
            <div className="zone-legend">
            <div className="item"><b>Corners carry metadata</b>Solid black pill, white all-caps text — year, make, series nickname. Flexible corner depending on photo negative space.</div>
            <div className="item"><b>Breathing room for type</b>Headline sits over sky, dirt, or dark zones — never across car detail. Full-bleed real photo underneath, never stock.</div>
            <div className="item"><b>OIO badge is conditional</b>Circle badge shows only when a human is on-camera; omit for pure car-detail shots. Builds the community feel.</div>
            <div className="item"><b>Never AI-invented subjects</b>AI composes and grades real source photos only. If the source is missing, it asks before generating anything.</div>
            <div className="item"><b>Bottom vignette backs the corner label</b>A black-to-transparent gradient rises from the frame's bottom edge, fading out well above the label. Gives it a consistent dark backdrop no matter what the photo actually looks like there.</div>
            <div className="item"><b>Square corners by default</b>Every box, label, card, and pill uses hard right-angle corners — no border-radius. The circle brand system (badges, rank circles, connector marks) is the one exception, always fully round, never partially rounded. Buttons default to square too.</div>
          </div>

          </details>

          <div className="subhead">Social Posts</div>

          <div className="social-cap" style={{ marginTop: "0.6rem", fontSize: "0.82rem" }}>Instagram</div>
          <div className="social-row">
            <div className="social-cell ig-square">
              <div className="social-cap">Square — 1:1</div>
              <div className="zone-diagram ar-11">
                <img className="z-bg" src="/betty-social-4x3.png" alt="Betty, a 1972 Datsun 521 pickup with a camper shell, loaded on a trailer, under a wide cloudy sky" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", transform: "none" }} />
                <div className="z-vignette"></div>
                <div className="z-logo"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
                <span className="z-corner corner-label right on-dark">
                  <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-social-4x3.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
                </span>
              </div>
            </div>
            <div className="social-cell ig-tall">
              <div className="social-cap">Vertical — 4:5</div>
              <div className="zone-diagram ar-45">
                <img className="z-bg" src="/betty-vert-wash.png" alt="Betty, a 1972 Datsun 521 pickup, hood up, parked in a garage bay during a wash" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", transform: "none" }} />
                <div className="z-vignette"></div>
                <div className="z-logo"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
                <span className="z-corner corner-label right on-dark">
                  <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-vert-wash.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
                </span>
              </div>
            </div>
            <div className="social-cell ig-wide">
              <div className="social-cap">Horizontal — 1.91:1</div>
              <div className="zone-diagram ar-191">
                <img className="z-bg" src="/betty-social-4x3.png" alt="Betty, a 1972 Datsun 521 pickup with a camper shell, loaded on a trailer, under a wide cloudy sky" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", transform: "none" }} />
                <div className="z-vignette"></div>
                <div className="z-logo"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
                <span className="z-corner corner-label right on-dark">
                  <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-social-4x3.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
                </span>
              </div>
            </div>
          </div>

          <div className="social-cap" style={{ marginTop: "1.4rem", fontSize: "0.82rem" }}>General crop</div>
          <div className="social-row">
            <div className="social-cell wide">
              <div className="social-cap">Horizontal — 4:3</div>
              <div className="zone-diagram ar-43">
                <img className="z-bg" src="/betty-social-4x3.png" alt="Betty, a 1972 Datsun 521 pickup with a camper shell, loaded on a trailer, under a wide cloudy sky" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", transform: "none" }} />
                <div className="z-vignette"></div>
                <div className="z-logo"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
                <span className="z-corner corner-label right on-dark">
                  <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-social-4x3.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
                </span>
              </div>
            </div>
            <div className="social-cell tall">
              <div className="social-cap">Vertical — 3:4</div>
              <div className="zone-diagram ar-34">
                <img className="z-bg" src="/betty-vert-wash.png" alt="Betty, a 1972 Datsun 521 pickup, hood up, parked in a garage bay during a wash" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", transform: "none" }} />
                <div className="z-vignette"></div>
                <div className="z-logo"><div className="brand-circle wordmark invert"><span>OIO</span></div></div>
                <span className="z-corner corner-label right on-dark">
                  <span className="cl-part cl-plain">1972 DATSUN 521</span><span className="cl-part cl-box"><span className="cl-window" style={{ "--win-img": "url('refs/betty-vert-wash.png')", "--win-size": "260cqw 260cqh", "--win-pos": "66% 74%" } as React.CSSProperties}>BETTY</span></span>
                </span>
              </div>
            </div>
          </div>

          <details className="rules"><summary>Rules</summary>
            <div className="zone-legend">
            <div className="item"><b>Logo badge, top-left</b>Social posts identify the channel, not one episode — a solid circle badge, always readable against whatever's behind it (invert to black-on-white over a light patch like sky).</div>
            <div className="item"><b>Corner label, bottom-right</b>Year/make/model and nickname, boxed on the outer edge, backed by the same bottom vignette so it stays legible over any photo.</div>
            <div className="item"><b>Sized for the platform, not stretched</b>Each frame is its own real photo, cropped and framed for its own aspect ratio — never one shot stretched or padded to fit multiple formats.</div>
            <div className="item"><b>Two groups, two purposes</b>Instagram is the real IG feed spec (square, 4:5, 1.91:1) — the ratios IG will actually display without cropping. General crop (4:3, 3:4) is for placements outside Instagram's feed (site, Facebook link preview, etc), not an Instagram export.</div>
            <div className="item"><b>Elements scaled to the real export size, not the mockup card</b>Authored against each format's real export resolution (1080px min width) — badge and corner label are sized in real px at that resolution, then expressed as cqh so they hold up at any preview size. The YouTube thumbnail above uses the same approach, against its own real 1280×720 export size.</div>
          </div>

          </details>
      </section>


      </div>
  </div>
);
