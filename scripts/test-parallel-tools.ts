
import { TwitterAgentService } from '../lib/ai/twitter-agent';

async function testParallelTools() {
    console.log("--- Testing HBL Tool Plan ---");
    // We simulate a request that requires multiple tools
    const result = await TwitterAgentService.generate(
        'HBL',
        'Check earnings, price history, and dividends.',
        'tweet',
        '',
        'short'
    );

    console.log("\n--- RESULT ---");
    console.log("Draft:", result.draft);
    console.log("Reasoning Logs related to tools:");
    result.reasoningLog.forEach(log => {
        if (log.type === 'tool_call' || log.type === 'tool_response') {
            console.log(`[${log.type}] ${log.name}`);
        }
    });
}

testParallelTools();
