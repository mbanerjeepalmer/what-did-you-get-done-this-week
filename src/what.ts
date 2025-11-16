import * as fs from 'fs';
import * as path from 'path';

const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


const CONFIG_DIR = path.join(process.env.HOME || '.', 'what-did-you-get-done-this-week');
const FILE_PATH = path.join(CONFIG_DIR, `${getLocalDateString()}.txt`);

(async () => {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });


    let displayTitle = 'What?';
    if (fs.existsSync(FILE_PATH)) {
        const lines = (await fs.promises.readFile(FILE_PATH, 'utf8')).trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine.includes('SNOOZE UNTIL')) {
            const snoozeMatch = lastLine.match(/SNOOZE UNTIL (.+)$/);
            if (snoozeMatch) {
                const snoozeTime = new Date(snoozeMatch[1].trim());
                if (new Date() < snoozeTime) {
                    displayTitle = `Snoozed until ${snoozeTime.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
                }
            }
        }
    }
    console.log(displayTitle);
    console.log('---');


    if (fs.existsSync(FILE_PATH)) {
        const lines = (await fs.promises.readFile(FILE_PATH, 'utf8')).trim().split('\n');
        const lastEntries = lines.slice(-5);
        const lastLine = lines[lines.length - 1];
        let shouldNotify = false;
        if (lastLine.includes('SNOOZE UNTIL')) {
            const snoozeMatch = lastLine.match(/SNOOZE UNTIL (.+)$/);
            if (snoozeMatch) {
                const snoozeTime = new Date(snoozeMatch[1].trim());
                shouldNotify = new Date() >= snoozeTime;
            }
        } else {
            const lastTimestamp = new Date(lastLine.split(/\s+/)[0]);
            const minutesSince = (new Date().getTime() - lastTimestamp.getTime()) / 60000;
            shouldNotify = isNaN(lastTimestamp.getTime()) || minutesSince >= 15;
        }
        if (shouldNotify) {
            require('child_process').exec('notify-send "What did you get done?"');
        }
        for (const line of lastEntries) {
            console.log(line.replace('\t', '    '));
        }
        console.log('---');
    } else {
        +        // Effectively first of the day
            +        require('child_process').exec('notify-send "What did you get done?"');
    }

    console.log('Enter what you did | bash="$HOME/what-did-you-get-done-this-week/add_entry.sh" terminal=false')
    console.log('Snooze for 15 minutes | bash="$HOME/what-did-you-get-done-this-week/snooze.sh 15" terminal=false')
    console.log('Custom snooze | bash="$HOME/what-did-you-get-done-this-week/snooze.sh custom" terminal=false')
    console.log('Refresh | refresh=true');
})();
