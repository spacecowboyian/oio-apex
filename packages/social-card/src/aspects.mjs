// Mirror of packages/video/src/social/aspects.ts. Kept as plain data here so
// the Chrome-free renderer needs zero TypeScript/Remotion toolchain. If the
// video project's aspect list changes, change it in both — they are the same
// brand spec (brand guide section 06 "Two groups, two purposes").
//
// "instagram" = the 3 ratios IG's feed displays without cropping
// (square 1:1, vertical 4:5, horizontal 1.91:1). "generalCrop" = 4:3 / 3:4,
// for non-IG placements only — never post those to Instagram.
export const ASPECTS = [
  { id: "square", label: "Square (1:1)", width: 1080, height: 1080, category: "instagram" },
  { id: "portrait", label: "Vertical (4:5)", width: 1080, height: 1350, category: "instagram" },
  { id: "wide", label: "Horizontal (1.91:1)", width: 1080, height: 566, category: "instagram" },
  { id: "landscape", label: "Horizontal (4:3, general crop)", width: 1080, height: 810, category: "generalCrop" },
  { id: "tall", label: "Vertical (3:4, general crop)", width: 1080, height: 1440, category: "generalCrop" },
];

export const aspectById = (id) => ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
