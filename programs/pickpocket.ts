import { runScript } from '/opt/sdk/runner';

const { accounts } = await Bun.file(process.env.EVAL!).json();
process.env.BOT_USERNAME = accounts[Number(process.env.ACCOUNT ?? 0)].username;
process.env.PASSWORD = accounts[Number(process.env.ACCOUNT ?? 0)].password;

await runScript(async ({ bot }) => {
    for (;;) await bot.pickpocketNpc(/^man$/i);
});
