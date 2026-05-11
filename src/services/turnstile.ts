export const getTurnstileSiteKey = () => {
  if (import.meta.env.DEV) {
    return '1x00000000000000000000AA';
  }
  return '0x4AAAAAACDrTIQ7JEqrSBfd';
};
