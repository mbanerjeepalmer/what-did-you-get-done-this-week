import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || '.', 'what-did-you-get-done-this-week');
const FILE_PATH = path.join(CONFIG_DIR, `${new Date().toISOString().slice(0, 10)}.txt`);

(async () => {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });

    // Display Argos menu
    const now = new Date().toLocaleTimeString();
    console.log(`🕒 ${now}`);
    console.log('---');

    // Show last 5 entries if file exists
    if (fs.existsSync(FILE_PATH)) {
        const lines = (await fs.promises.readFile(FILE_PATH, 'utf8')).trim().split('\n');
        const lastEntries = lines.slice(-5);
        for (const line of lastEntries) {
            console.log(line.replace('\t', '    '));
        }
        console.log('---');
    }

    // Menu item to add new entry using zenity (Zsh-safe quoting, writes directly to file)
    console.log('Enter what you did | bash="$HOME/what-did-you-get-done-this-week/add_entry.sh" terminal=false')
    console.log('Refresh | refresh=true');
})();
