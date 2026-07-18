export type AspectId = "square" | "portrait" | "wide" | "landscape" | "tall";

/**
 * "instagram" = one of the 3 ratios IG's feed actually displays without
 * cropping (square 1:1, vertical 4:5, horizontal 1.91:1). "generalCrop" =
 * everything else (4:3, 3:4) — kept for placements outside the IG feed
 * (site, Facebook link preview), never posted to Instagram directly. See
 * brand guide section 06 "Two groups, two purposes."
 */
export type AspectCategory = "instagram" | "generalCrop";

export type Aspect = {
  id: AspectId;
  label: string;
  width: number;
  height: number;
  category: AspectCategory;
};

// Mirrors the brand guide's "Social Posts" section (06), which splits into
// two labeled groups. Portrait was originally 3:4 (1080x1440), but
// Instagram's actual max portrait ratio for feed posts is 4:5 — a 3:4
// upload gets silently center-cropped at post time, cutting off the badge
// and corner label near the frame edges (confirmed via a real post that
// shipped cropped this way, fixed 2026-07-18). Square and 1.91:1 added the
// same day so this generator can actually produce every ratio Instagram's
// feed accepts, not just the vertical one.
export const ASPECTS: Aspect[] = [
  { id: "square", label: "Square (1:1)", width: 1080, height: 1080, category: "instagram" },
  { id: "portrait", label: "Vertical (4:5)", width: 1080, height: 1350, category: "instagram" },
  { id: "wide", label: "Horizontal (1.91:1)", width: 1080, height: 566, category: "instagram" },
  { id: "landscape", label: "Horizontal (4:3, general crop)", width: 1080, height: 810, category: "generalCrop" },
  { id: "tall", label: "Vertical (3:4, general crop)", width: 1080, height: 1440, category: "generalCrop" },
];

export const aspectById = (id: AspectId): Aspect => ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
