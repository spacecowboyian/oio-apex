export type AspectId = "square" | "portrait" | "landscape";

export type Aspect = {
  id: AspectId;
  label: string;
  width: number;
  height: number;
};

// The two export sizes the brand guide's "Social Posts" section (06) locks
// in — Meta feed-image spec, 1080px min width: 1080x810 (4:3) and 1080x1440
// (3:4). Not square/16:9 — don't add formats the guide hasn't validated
// against real footage.
export const ASPECTS: Aspect[] = [
  { id: "landscape", label: "Horizontal (4:3)", width: 1080, height: 810 },
  { id: "portrait", label: "Vertical (3:4)", width: 1080, height: 1440 },
];

export const aspectById = (id: AspectId): Aspect => ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
