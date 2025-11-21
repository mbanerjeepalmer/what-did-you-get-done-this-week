import * as fs from 'fs';
import * as path from 'path';

const getLocalDateString = (date?: Date) => {
    const now = date || new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


const CONFIG_DIR = path.join(process.env.HOME || '.', 'what-did-you-get-done-this-week');

const getLatestFilePath = () => {
    let currentDate = new Date();
    for (let i = 0; i < 30; i++) { // Check up to 30 days back
        const dateStr = getLocalDateString(currentDate);
        const filePath = path.join(CONFIG_DIR, `${dateStr}.txt`);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
        currentDate.setDate(currentDate.getDate() - 1);
    }
    return null;
};

const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}h${mins.toString().padStart(2, '0')}m`;
};

(async () => {
    await fs.promises.mkdir(CONFIG_DIR, { recursive: true });

    const latestFile = getLatestFilePath();

    const now = new Date();
    let nextTime: Date;
    let totalTime = '00h00m';
    if (latestFile) {
        const lines = (await fs.promises.readFile(latestFile, 'utf8')).trim().split('\n');
        const nonSnoozeLines = lines.filter(line => !line.includes('SNOOZE'));
        const totalMinutes = nonSnoozeLines.length * 15;
        totalTime = formatTime(totalMinutes);
        const lastLine = lines[lines.length - 1];
        if (lastLine.includes('SNOOZE UNTIL')) {
            const snoozeMatch = lastLine.match(/SNOOZE UNTIL (.+)$/);
            if (snoozeMatch) {
                nextTime = new Date(snoozeMatch[1].trim());
            } else {
                nextTime = now;
            }
        } else {
            const lastTimestamp = new Date(lastLine.split(/\s+/)[0]);
            if (isNaN(lastTimestamp.getTime())) {
                nextTime = now;
            } else {
                nextTime = new Date(lastTimestamp.getTime() + 15 * 60000);
            }
        }
    } else {
        nextTime = now;
    }
    const minutesLeft = Math.ceil((nextTime.getTime() - now.getTime()) / 60000);
    let displayTitle = minutesLeft.toString();
    console.log(displayTitle);
    console.log('---');
    console.log(totalTime);
    console.log('---');


    if (latestFile) {
        const lines = (await fs.promises.readFile(latestFile, 'utf8')).trim().split('\n');
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
        // Effectively first of the day
        require('child_process').exec('notify-send "What did you get done?"');
    }

    console.log('Enter what you did | bash="$HOME/what-did-you-get-done-this-week/add_entry.sh" terminal=false')
    console.log('Snooze for 15 minutes | bash="$HOME/what-did-you-get-done-this-week/snooze.sh 15" terminal=false')
    console.log('Custom snooze | bash="$HOME/what-did-you-get-done-this-week/snooze.sh custom" terminal=false')
    console.log('Refresh | refresh=true');
})();
