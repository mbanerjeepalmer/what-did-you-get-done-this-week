<script lang="ts">
    import { mkdir, exists, open, BaseDirectory } from "@tauri-apps/plugin-fs";
    import { join } from "@tauri-apps/api/path";
    import {
        getCurrentWindow,
        CloseRequestedEvent,
    } from "@tauri-apps/api/window";
    import { TrayIcon } from "@tauri-apps/api/tray";
    import { Menu } from "@tauri-apps/api/menu";
    import { onMount } from "svelte";

    let achieved = $state("");
    type Names = typeof names;
    type Role = keyof Names;

    const names = {
        questioner: "Elon Musk",
        responder: "You",
    } as const;

    const initial = {
        role: "questioner",
        text: `What did you get done in the last 15 minutes?`,
    } as const;
    let messages = $state<{ role: Role; text: string }[]>([initial]);

    const startText = `You are free to tweet "is Twitter dying?" or anything else about Twitter - but it's my responsibility to tell you that it's not helping me make Twitter better in the current context. Next time we speak, I'd like to you provide you perspective on the level of internal distraction right now and how it hurting our ability to do work. I hope the AMA will help people get to know you, to understand why you believe in Twitter, and to trust you - and I'd like the company to get to a place where we are more resilient and don't get distracted, but we aren't there right now.`;

    onMount(async () => {
        const menu = await Menu.new({
            items: [
                {
                    id: "trigger",
                    text: "Trigger",
                    action: async () => {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000),
                        );
                        await getCurrentWindow().show();
                        await getCurrentWindow().setFocus();
                    },
                },
                {
                    id: "quit",
                    text: "Quit",
                    action: async () => await getCurrentWindow().destroy(),
                },
            ],
        });
        const tray = await TrayIcon.new({ menu, icon: "/sink.png" });
        await getCurrentWindow().onCloseRequested(
            async (event: CloseRequestedEvent) => {
                await getCurrentWindow().hide();
                event.preventDefault();
            },
        );
    });

    async function report(event: Event) {
        event.preventDefault();

        try {
            const today = new Date();
            const filename = today.toISOString().split("T")[0] + ".txt";

            const dirPath = "what-did-you-get-done-this-week";

            if (!(await exists(dirPath, { baseDir: BaseDirectory.Home }))) {
                await mkdir(dirPath, {
                    baseDir: BaseDirectory.Home,
                    recursive: true,
                });
            }

            const filepath = await join(dirPath, filename);
            const outFile = await open(filepath, {
                read: true,
                append: true,
                baseDir: BaseDirectory.Home,
                create: true,
            });
            if (!(await exists(filepath, { baseDir: BaseDirectory.Home }))) {
            }
            const now = new Date();
            const timestamp =
                now.toISOString().split("T")[0] +
                " " +
                now.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                });
            const record = `${timestamp} ${achieved}\n`;
            await outFile.write(new TextEncoder().encode(record));
            await outFile.close();
            messages.push({ role: "responder", text: achieved });
            achieved = "";
            await new Promise((resolve) => setTimeout(resolve, 1000));

            if (Math.random() < 0.1) {
                messages.push({
                    role: "questioner",
                    text: "I'm not joining the board. This is a waste of time.",
                });
                await new Promise((resolve) => setTimeout(resolve, 1000));

                await getCurrentWindow().minimize();
                messages = [initial];

                await new Promise((resolve) =>
                    setTimeout(resolve, 15 * 60 * 1000),
                );
                await getCurrentWindow().show();
                await getCurrentWindow().setFocus();
            }
        } catch (err) {
            console.error("Failed to write file:", err);
        }
    }
</script>

<main class="container flex flex-col min-h-screen p-2">
    <div class="flex-grow flex flex-col overflow-y-auto">
        <div class="flex-grow"></div>
        <div class="space-y-8">
            <div class="filter blur-sm p-2">
                <div class={`font-bold text-name-red`}>Parag Agrawal</div>
                <div class="text-lg">{startText}</div>
            </div>
            {#each messages as message}
                <div class="p-2">
                    <div
                        class={`font-bold ${message.role === "questioner" ? "text-name-blue" : "text-name-red"}`}
                    >
                        {names[message.role]}
                    </div>
                    <div class="text-lg">{message.text}</div>
                </div>
            {/each}
        </div>

        <form class="flex gap-2 mt-4 p-2" onsubmit={report}>
            <input
                type="text"
                class="flex-grow p-3"
                placeholder=""
                bind:value={achieved}
            />
            <button
                type="submit"
                class="px-4 py-2 bg-blue-500 text-white rounded"
            >
                ➤
            </button>
        </form>
    </div>
</main>
