import * as fs from 'fs';

const isProcessAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * Attempts to claim a lock file, e.g. so a cron tick doesn't pop a second
 * dialog while a previous one is still awaiting a response. Returns false
 * if a live process already holds the lock; clears stale locks left by a
 * process that no longer exists.
 */
export const acquireLock = (lockPath: string, pid: number = process.pid): boolean => {
    if (fs.existsSync(lockPath)) {
        const heldPid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
        if (!isNaN(heldPid) && isProcessAlive(heldPid)) {
            return false;
        }
    }
    fs.writeFileSync(lockPath, String(pid));
    return true;
};

export const releaseLock = (lockPath: string): void => {
    try {
        fs.unlinkSync(lockPath);
    } catch {
        // already gone
    }
};
