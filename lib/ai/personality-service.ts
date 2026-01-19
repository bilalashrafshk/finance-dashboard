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
    brain_model?: string;
    hand_model?: string;
    humanizer_model?: string;
    enabled_tools: Record<string, boolean>;
    coordinator_instructions?: string; // Legacy
    humanizer_instructions?: string;   // Legacy
    briefing_instructions?: string;    // Legacy (Briefing Drafter)

    // New Granular Fields
    tweet_coordinator_prompt?: string;
    tweet_drafter_prompt?: string;
    tweet_humanizer_prompt?: string;
    tweet_tools?: Record<string, boolean>;

    reply_coordinator_prompt?: string;
    reply_drafter_prompt?: string;
    reply_humanizer_prompt?: string;
    reply_tools?: Record<string, boolean>;

    briefing_coordinator_prompt?: string;
    briefing_humanizer_prompt?: string;
    briefing_tools?: Record<string, boolean>;
}

export class PersonalityService {
    private static async ensureTableExists(): Promise<void> {
        const pool = getPool();
        // 1. Create table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS brand_personality (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(50) UNIQUE NOT NULL,
                instructions TEXT NOT NULL,
                examples JSONB DEFAULT '[]',
                default_model VARCHAR(50) DEFAULT 'gemini-2.0-flash',
                enabled_tools JSONB DEFAULT '{"getCompanyProfile":true,"getPriceHistoryMetrics":true,"getQuarterlyEarnings":true,"getAnnualEarnings":true,"getDividendInfo":true,"googleSearch":true}',
                coordinator_instructions TEXT,
                humanizer_instructions TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Run migrations (Add columns if they don't exist)
        await pool.query(`
            -- Migration: Add enabled_tools if it doesn't exist
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

            -- Migration: Add model override columns
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='brain_model') THEN
                    ALTER TABLE brand_personality ADD COLUMN brain_model VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='hand_model') THEN
                    ALTER TABLE brand_personality ADD COLUMN hand_model VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='humanizer_model') THEN
                    ALTER TABLE brand_personality ADD COLUMN humanizer_model VARCHAR(50);
                END IF;
            END $$;

            -- Migration: Add briefing_instructions if it doesn't exist
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brand_personality' AND column_name='briefing_instructions') THEN
                    ALTER TABLE brand_personality ADD COLUMN briefing_instructions TEXT;
                END IF;
            END $$;
        `);

        // 3. Seed/Update default personality
        await pool.query(`
            INSERT INTO brand_personality (slug, instructions, examples)
            VALUES (
                'bilal-ashraf',
                'Core Persona: Calm, analytical, and confident investor. Slightly skeptical of hype. Focused on signal over noise. Tone: Intelligent, grounded, quietly opinionated. Direct but not aggressive. Writing Style: Short to medium sentences, no paragraphs. No emojis, no hashtags, no exclamation marks. Opinion Framing: "Worth thinking about...", "The market is focused on X, but Y is the real driver." Crypto: Focus on cycles, liquidity, narratives. Pakistan Finance: Realistic, policy-focused, avoid emotional hype.',
                '[{"text": "Markets are noisy right now. Price is reacting to headlines. Positioning is reacting to liquidity. I trust the second more than the first.", "type": "short"}, {"text": "The valuation of ALTs against Silver is now below the 2022 low. We cannot manufacture market conditions that do not exist. Trade the market you have, not the market you want.", "type": "short"}]'
            ) ON CONFLICT (slug) DO NOTHING;
        `);

        // 4. Run data migrations (examples format conversion)
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

        const parseTools = (val: any) => typeof val === 'string' ? JSON.parse(val) : (val || {});

        return {
            slug: row.slug,
            instructions: row.instructions,
            examples,
            default_model: row.default_model,
            enabled_tools: parseTools(row.enabled_tools),
            coordinator_instructions: row.coordinator_instructions,
            humanizer_instructions: row.humanizer_instructions,
            brain_model: row.brain_model,
            hand_model: row.hand_model,
            humanizer_model: row.humanizer_model,
            briefing_instructions: row.briefing_instructions,

            // Granular
            tweet_coordinator_prompt: row.tweet_coordinator_prompt,
            tweet_drafter_prompt: row.tweet_drafter_prompt,
            tweet_humanizer_prompt: row.tweet_humanizer_prompt,
            tweet_tools: parseTools(row.tweet_tools),

            reply_coordinator_prompt: row.reply_coordinator_prompt,
            reply_drafter_prompt: row.reply_drafter_prompt,
            reply_humanizer_prompt: row.reply_humanizer_prompt,
            reply_tools: parseTools(row.reply_tools),

            briefing_coordinator_prompt: row.briefing_coordinator_prompt,
            briefing_humanizer_prompt: row.briefing_humanizer_prompt,
            briefing_tools: parseTools(row.briefing_tools),
        };
    }

    static async updatePersonality(slug: string, data: Partial<BrandPersonality>): Promise<void> {
        const pool = getPool();
        const fields = [];
        const values = [];
        let i = 1;

        const simpleFields = [
            'instructions', 'default_model', 'coordinator_instructions', 'humanizer_instructions',
            'brain_model', 'hand_model', 'humanizer_model', 'briefing_instructions',
            'tweet_coordinator_prompt', 'tweet_drafter_prompt', 'tweet_humanizer_prompt',
            'reply_coordinator_prompt', 'reply_drafter_prompt', 'reply_humanizer_prompt',
            'briefing_coordinator_prompt', 'briefing_humanizer_prompt'
        ];

        simpleFields.forEach(f => {
            if ((data as any)[f] !== undefined) {
                fields.push(`${f} = $${i++}`);
                values.push((data as any)[f]);
            }
        });

        // JSON Fields
        if (data.examples) {
            fields.push(`examples = $${i++}`);
            values.push(JSON.stringify(data.examples));
        }
        if (data.enabled_tools) {
            fields.push(`enabled_tools = $${i++}`);
            values.push(JSON.stringify(data.enabled_tools));
        }
        if (data.tweet_tools) {
            fields.push(`tweet_tools = $${i++}`);
            values.push(JSON.stringify(data.tweet_tools));
        }
        if (data.reply_tools) {
            fields.push(`reply_tools = $${i++}`);
            values.push(JSON.stringify(data.reply_tools));
        }
        if (data.briefing_tools) {
            fields.push(`briefing_tools = $${i++}`);
            values.push(JSON.stringify(data.briefing_tools));
        }

        if (fields.length === 0) return;

        values.push(slug);
        await pool.query(`UPDATE brand_personality SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = $${i}`, values);
    }
}
