import schedule from 'node-schedule';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Automates the announcement analysis pipeline.
 * Runs every 5 minutes during PSX market hours.
 * Deduplication is handled within analyze-announcements.ts
 */

async function runAnalysis() {
    const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    console.log(`\n[${now}] 🕒 Triggering Announcement Check...`);

    try {
        // We run the analysis script which now has built-in deduplication
        const { stdout, stderr } = await execAsync('npx tsx scripts/analyze-announcements.ts');

        if (stdout) {
            // Only log meaningful output if new events were found or processing happened
            if (stdout.includes('🧠 Analyzing') || stdout.includes('✨ AI Output')) {
                console.log(stdout);
            } else {
                console.log('✅ Check complete. No new priority announcements.');
            }
        }
        if (stderr) console.error('⚠️ Stderr:', stderr);

    } catch (error: any) {
        console.error('❌ Cron Execution Error:', error.message);
    }
}

// Schedule Rule: Every 5 minutes, Monday through Friday
// Window: 9:00 AM to 4:00 PM Pakistan Time (PKT)
const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [new schedule.Range(1, 5)]; // Mon-Fri
rule.hour = new schedule.Range(9, 16);     // 9:00 - 16:59
rule.minute = new schedule.Range(0, 59, 5); // Every 5 minutes
rule.tz = 'Asia/Karachi';

console.log('🚀 Announcement Monitor Service Started.');
console.log('📅 Schedule: Every 5 minutes | Mon-Fri | 09:00 - 16:00 PKT');

const job = schedule.scheduleJob(rule, runAnalysis);

// Run an initial check on startup
runAnalysis();
