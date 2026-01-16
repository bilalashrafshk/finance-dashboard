import { getPool } from '@/lib/db';

export interface BrandPersonality {
    slug: string;
    instructions: string;
    examples: string[];
    default_model: string;
}

export class PersonalityService {
    static async getPersonality(slug: string = 'bilal-ashraf'): Promise<BrandPersonality | null> {
        const pool = getPool();
        const res = await pool.query('SELECT * FROM brand_personality WHERE slug = $1', [slug]);
        if (res.rows.length === 0) return null;

        const row = res.rows[0];
        return {
            slug: row.slug,
            instructions: row.instructions,
            examples: Array.isArray(row.examples) ? row.examples : JSON.parse(row.examples || '[]'),
            default_model: row.default_model
        };
    }

    static async updatePersonality(slug: string, data: Partial<BrandPersonality>): Promise<void> {
        const pool = getPool();
        const fields = [];
        const values = [];
        let i = 1;

        if (data.instructions) {
            fields.push(`instructions = $${i++}`);
            values.push(data.instructions);
        }
        if (data.examples) {
            fields.push(`examples = $${i++}`);
            values.push(JSON.stringify(data.examples));
        }
        if (data.default_model) {
            fields.push(`default_model = $${i++}`);
            values.push(data.default_model);
        }

        if (fields.length === 0) return;

        values.push(slug);
        await pool.query(`UPDATE brand_personality SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = $${i}`, values);
    }
}
