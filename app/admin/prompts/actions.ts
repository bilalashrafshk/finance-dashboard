'use server';

import { getPool } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function getPrompts() {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM ai_prompts ORDER BY description ASC');
    return rows;
}

export async function updatePrompt(slug: string, content: string) {
    const pool = getPool();
    await pool.query(
        'UPDATE ai_prompts SET content = $1, updated_at = NOW() WHERE slug = $2',
        [content, slug]
    );
    revalidatePath('/admin/prompts');
}
