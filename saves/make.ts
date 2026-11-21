// Builds the start saves with rs-sdk's own save generator (MIT). Run inside the world image:
//   docker run --rm --user $(id -u) -v $PWD/saves:/evals/saves rs-evals-world:71d949d bun /evals/saves/make.ts
import { createSaveData } from '/opt/sdk/test/utils/save-generator';

// A new character in Lumbridge, next to the men by the castle.
await Bun.write(`${import.meta.dir}/lumbridge.sav`, createSaveData({ position: { x: 3231, z: 3218 } }));
