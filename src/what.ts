import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || '.', 'what-did-you-get-done-this-week');
const FILE_PATH = path.join(CONFIG_DIR, `${new Date().toISOString().slice(0, 10)}.txt`);

(async () => {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });

    console.log(`What?`);
    console.log('---');


    if (fs.existsSync(FILE_PATH)) {
        const lines = (await fs.promises.readFile(FILE_PATH, 'utf8')).trim().split('\n');
        const lastEntries = lines.slice(-5);
        const lastLine = lines[lines.length - 1];
        const lastTimestamp = new Date(lastLine.split(/\s+/)[0]);
        const now = new Date();
        const minutesSince = (now.getTime() - lastTimestamp.getTime()) / 60000;
        if (isNaN(lastTimestamp.getTime()) || minutesSince >= 15) {
            require('child_process').exec('notify-send "What did you get done?"');
        }
        for (const line of lastEntries) {
            console.log(line.replace('\t', '    '));
        }
        console.log('---');
    }
    if (!fs.existsSync(FILE_PATH)) {
        require('child_process').exec('notify-send "What did you get done?"');
    }

    console.log('Enter what you did | bash="$HOME/what-did-you-get-done-this-week/add_entry.sh" terminal=false')
    console.log('Refresh | refresh=true');
})();
