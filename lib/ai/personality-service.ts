import { getPool } from '@/lib/db';

export interface BrandPersonality {
    slug: string;
    instructions: string;
    examples: string[];
    default_model: string;
    enabled_tools: Record<string, boolean>;
}

export class PersonalityService {
    private static async ensureTableExists(): Promise<void> {
        const pool = getPool();
        // Check if table exists
        const checkRes = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'brand_personality'
            );
        `);

        if (!checkRes.rows[0].exists) {
            console.log('🏗️ Creating brand_personality table...');
            await pool.query(`
                CREATE TABLE IF NOT EXISTS brand_personality (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    slug VARCHAR(50) UNIQUE NOT NULL,
                    instructions TEXT NOT NULL,
                    examples JSONB DEFAULT '[]',
                    default_model VARCHAR(50) DEFAULT 'gemini-2.0-flash',
                    enabled_tools JSONB DEFAULT '{"getCompanyProfile":true,"getPriceHistoryMetrics":true,"getQuarterlyEarnings":true,"getAnnualEarnings":true,"getDividendInfo":true}',
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                -- Migration: Add enabled_tools if it doesn't exist (for existing tables)
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='enabled_tools') THEN
                        ALTER TABLE brand_personality ADD COLUMN enabled_tools JSONB DEFAULT '{"getCompanyProfile":true,"getPriceHistoryMetrics":true,"getQuarterlyEarnings":true,"getAnnualEarnings":true,"getDividendInfo":true}';
                    END IF;
                END $$;

                -- Seed with default guidelines if empty
                INSERT INTO brand_personality (slug, instructions, examples)
                VALUES (
                    'bilal-ashraf',
                    'Core Persona: Calm, analytical, and confident investor. Slightly skeptical of hype. Focused on signal over noise. Tone: Intelligent, grounded, quietly opinionated. Direct but not aggressive. Writing Style: Short to medium sentences, no paragraphs. No emojis, no hashtags, no exclamation marks. Opinion Framing: "Worth thinking about...", "The market is focused on X, but Y is the real driver." Crypto: Focus on cycles, liquidity, narratives. Pakistan Finance: Realistic, policy-focused, avoid emotional hype.',
                    '["Markets are noisy right now. Price is reacting to headlines. Positioning is reacting to liquidity. I trust the second more than the first.", "The valuation of ALTs against Silver is now below the 2022 low. We cannot manufacture market conditions that do not exist. Trade the market you have, not the market you want."]'
                ) ON CONFLICT (slug) DO NOTHING;
            `);
        }
    }

    static async getPersonality(slug: string = 'bilal-ashraf'): Promise<BrandPersonality | null> {
        await this.ensureTableExists();
        const pool = getPool();
        const res = await pool.query('SELECT * FROM brand_personality WHERE slug = $1', [slug]);
        if (res.rows.length === 0) return null;

        const row = res.rows[0];
        return {
            slug: row.slug,
            instructions: row.instructions,
            examples: Array.isArray(row.examples) ? row.examples : JSON.parse(row.examples || '[]'),
            default_model: row.default_model,
            enabled_tools: typeof row.enabled_tools === 'string' ? JSON.parse(row.enabled_tools) : (row.enabled_tools || {})
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
        if (data.enabled_tools) {
            fields.push(`enabled_tools = $${i++}`);
            values.push(JSON.stringify(data.enabled_tools));
        }

        if (fields.length === 0) return;

        values.push(slug);
        await pool.query(`UPDATE brand_personality SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = $${i}`, values);
    }
}
