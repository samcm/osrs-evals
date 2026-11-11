import { createSaveData } from '/opt/sdk/test/utils/save-generator';

await Bun.write(`${import.meta.dir}/lumbridge.sav`, createSaveData({ position: { x: 3231, z: 3218 } }));
