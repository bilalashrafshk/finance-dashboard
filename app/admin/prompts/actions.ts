'use server';

import { getPool } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function getPrompts() {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM ai_prompts ORDER BY description ASC');

    // Also fetch briefing_instructions from brand_personality
    const brandRes = await pool.query("SELECT briefing_instructions FROM brand_personality WHERE slug = 'bilal-ashraf'");
    if (brandRes.rows.length > 0 && brandRes.rows[0].briefing_instructions) {
        rows.push({
            slug: 'briefing_instructions',
            description: 'News Briefing Instructions',
            content: brandRes.rows[0].briefing_instructions
        });
    }

    return rows;
}

export async function updatePrompt(slug: string, content: string) {
    const pool = getPool();

    if (slug === 'briefing_instructions') {
        await pool.query(
            "UPDATE brand_personality SET briefing_instructions = $1, updated_at = NOW() WHERE slug = 'bilal-ashraf'",
            [content]
        );
    } else {
        await pool.query(
            'UPDATE ai_prompts SET content = $1, updated_at = NOW() WHERE slug = $2',
            [content, slug]
        );
    }
    revalidatePath('/admin/prompts');
}

export async function getAlertConfigs() {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM alert_configs ORDER BY key ASC');
    return rows;
}

export async function updateAlertConfig(key: string, value: any) {
    const pool = getPool();
    await pool.query(
        'UPDATE alert_configs SET value = $1, updated_at = NOW() WHERE key = $2',
        [JSON.stringify(value), key]
    );
    revalidatePath('/admin/prompts');
}
