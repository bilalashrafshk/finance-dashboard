import { getPool } from '@/lib/db';

export interface Example {
    text: string;
    type: 'short' | 'long';
}

export interface BrandPersonality {
    slug: string;
    instructions: string;
    examples: Example[];
    default_model: string;
    enabled_tools: Record<string, boolean>;
    coordinator_instructions?: string; // Instructions for the PLANNING phase
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
                    enabled_tools JSONB DEFAULT '{"getCompanyProfile":true,"getPriceHistoryMetrics":true,"getQuarterlyEarnings":true,"getAnnualEarnings":true,"getDividendInfo":true,"googleSearch":true}',
                    coordinator_instructions TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                -- Migration: Add enabled_tools if it doesn't exist (for existing tables)
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='enabled_tools') THEN
                        ALTER TABLE brand_personality ADD COLUMN enabled_tools JSONB DEFAULT '{"getCompanyProfile":true,"getPriceHistoryMetrics":true,"getQuarterlyEarnings":true,"getAnnualEarnings":true,"getDividendInfo":true,"googleSearch":true}';
                    END IF;
                END $$;

                -- Migration: Add coordinator_instructions if it doesn't exist
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='coordinator_instructions') THEN
                        ALTER TABLE brand_personality ADD COLUMN coordinator_instructions TEXT;
                    END IF;
                END $$;

                -- Seed with default guidelines if empty
                INSERT INTO brand_personality (slug, instructions, examples)
                VALUES (
                    'bilal-ashraf',
                    'Core Persona: Calm, analytical, and confident investor. Slightly skeptical of hype. Focused on signal over noise. Tone: Intelligent, grounded, quietly opinionated. Direct but not aggressive. Writing Style: Short to medium sentences, no paragraphs. No emojis, no hashtags, no exclamation marks. Opinion Framing: "Worth thinking about...", "The market is focused on X, but Y is the real driver." Crypto: Focus on cycles, liquidity, narratives. Pakistan Finance: Realistic, policy-focused, avoid emotional hype.',
                    '[{"text": "Markets are noisy right now. Price is reacting to headlines. Positioning is reacting to liquidity. I trust the second more than the first.", "type": "short"}, {"text": "The valuation of ALTs against Silver is now below the 2022 low. We cannot manufacture market conditions that do not exist. Trade the market you have, not the market you want.", "type": "short"}]'
                ) ON CONFLICT (slug) DO UPDATE SET 
                    coordinator_instructions = CASE 
                        WHEN brand_personality.coordinator_instructions IS NULL THEN 'You are the COORDINATOR of an investment agent. Analyze the user\\''s input and current context carefully. Your priority is to determine if the existing information is sufficient to create a high-quality post. - IF the user provides rich context (like a news announcement), your first instinct should be to use that. - ONLY plan a tool call if you need specific quantitative data (Price, P/E, etc.) that would significantly enhance the post\\''s signal OR if the user explicitly asks for data. - DO NOT chase stats for the sake of it. If the news is the primary signal, skip the tools. - DO NOT write the final tweet/reply yet. Available Tools: 1. Price Metrics: Current price, daily change, high/low. (Use if price action is the focus). 2. P/E & Valuation: P/E vs Sector P/E. (Use if valuation is the core question). 3. Earnings: Recent quarters/annual performance. (Use for deep financial analysis). 4. Dividends: Yield and history. (Use if income is the focus). 5. Google Search: Latest web info. (Use ONLY if explicitly asked or for missing macro news).'
                        ELSE brand_personality.coordinator_instructions 
                    END;
            `);
        }

        // Migration: Check if examples need conversion from string[] to Example[]
        // This SQL block will convert any examples that are still string arrays into the new object format.
        await pool.query(`
            UPDATE brand_personality 
            SET examples = (
                SELECT jsonb_agg(jsonb_build_object('text', elem, 'type', 'short'))
                FROM jsonb_array_elements_text(examples) AS elem
            )
            WHERE jsonb_typeof(examples) = 'array' AND jsonb_array_length(examples) > 0 AND jsonb_typeof(examples->0) = 'string';
        `);
    }

    static async getPersonality(slug: string = 'bilal-ashraf'): Promise<BrandPersonality | null> {
        await this.ensureTableExists();
        const pool = getPool();
        const res = await pool.query('SELECT * FROM brand_personality WHERE slug = $1', [slug]);
        if (res.rows.length === 0) return null;

        const row = res.rows[0];
        let examples: Example[] = [];
        try {
            const rawExamples = Array.isArray(row.examples) ? row.examples : JSON.parse(row.examples || '[]');
            examples = rawExamples.map((ex: any) => {
                if (typeof ex === 'string') return { text: ex, type: 'short' };
                return ex as Example;
            });
        } catch (e) {
            examples = [];
        }

        return {
            slug: row.slug,
            instructions: row.instructions,
            examples,
            default_model: row.default_model,
            enabled_tools: typeof row.enabled_tools === 'string' ? JSON.parse(row.enabled_tools) : (row.enabled_tools || {}),
            coordinator_instructions: row.coordinator_instructions
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
        if (data.coordinator_instructions !== undefined) {
            fields.push(`coordinator_instructions = $${i++}`);
            values.push(data.coordinator_instructions);
        }

        if (fields.length === 0) return;

        values.push(slug);
        await pool.query(`UPDATE brand_personality SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = $${i}`, values);
    }
}
