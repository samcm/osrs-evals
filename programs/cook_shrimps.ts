// A scripted baseline for the shrimps eval: bank to range and back, one shrimp at a time.
// No model; compare model agents with it on ticks.
import { runScript } from '/opt/sdk/runner';

const { accounts } = await Bun.file(process.env.EVAL!).json();
process.env.BOT_USERNAME = accounts[0].username;
process.env.PASSWORD = accounts[0].password;
const RANGE = { x: 3273, z: 3180 };
const BANK = { x: 3269, z: 3167 };

await runScript(async ({ bot, sdk }) => {
    for (;;) {
        if (!sdk.findInventoryItem(/^raw shrimps$/i)) {
            await bot.walkTo(BANK.x, BANK.z);
            await bot.openBank();
            for (const item of sdk.getInventory()) await bot.depositItem(item, -1);
            const got = await bot.withdrawItem(/^raw shrimps$/i, 28);
            await bot.closeBank();
            if (!got.success) return; // none left
            await bot.walkTo(RANGE.x, RANGE.z);
        }
        const raw = sdk.findInventoryItem(/^raw shrimps$/i);
        if (!raw) continue;
        const rawCount = (s: any) => s.inventory.filter((i: any) => /^raw shrimps$/i.test(i.name)).length;
        const before = rawCount(sdk.getState());
        await bot.useItemOnLoc(raw, /^range$/i);
        // Cooking takes a few ticks: wait for this shrimp to change, answering any cook prompt.
        await sdk.waitForCondition((s) => s.dialog?.isOpen || rawCount(s) < before, 5000).catch(() => {});
        if (sdk.getState()?.dialog?.isOpen) await sdk.sendClickDialog(0);
    }
});
