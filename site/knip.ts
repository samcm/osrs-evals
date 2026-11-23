// Knip's Vite plugin finds main.tsx on its own. Its Tailwind plugin also reduces CSS files to their
// imports (@import, @plugin), so the stylesheets listed in `project` count as importers.
//
// The knip script sets KNIP_DISABLE_RAW_TRANSFER: knip's parser otherwise reserves 6 GiB of
// address space, which Linux refuses on machines with less memory plus swap than that.
export default {
  entry: ['src/routes/**/*.tsx'],
  project: ['src/**/*.{ts,tsx,css}'],
};
