/** A heat scale: one hue in tint steps, darker for a higher share (0 to 1). */

const tintClassNames = ['bg-success-5', 'bg-success-15', 'bg-success-25', 'bg-success-40', 'bg-success-50'];

export const tint = (share: number): string =>
  tintClassNames[Math.max(0, Math.min(tintClassNames.length - 1, Math.floor(share * tintClassNames.length)))];
