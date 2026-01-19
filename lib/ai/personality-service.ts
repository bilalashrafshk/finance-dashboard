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
    coordinator_instructions?: string; // Instructions for the PLANNING phase
    humanizer_instructions?: string;   // Stylistic refinement phase
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
        `);

        // 3. Seed/Update default personality
        await pool.query(`
            INSERT INTO brand_personality (slug, instructions, examples)
            VALUES (
                'bilal-ashraf',
                'Core Persona: Calm, analytical, and confident investor. Slightly skeptical of hype. Focused on signal over noise. Tone: Intelligent, grounded, quietly opinionated. Direct but not aggressive. Writing Style: Short to medium sentences, no paragraphs. No emojis, no hashtags, no exclamation marks. Opinion Framing: "Worth thinking about...", "The market is focused on X, but Y is the real driver." Crypto: Focus on cycles, liquidity, narratives. Pakistan Finance: Realistic, policy-focused, avoid emotional hype.',
                '[{"text": "Markets are noisy right now. Price is reacting to headlines. Positioning is reacting to liquidity. I trust the second more than the first.", "type": "short"}, {"text": "The valuation of ALTs against Silver is now below the 2022 low. We cannot manufacture market conditions that do not exist. Trade the market you have, not the market you want.", "type": "short"}]'
            ) ON CONFLICT (slug) DO UPDATE SET 
                coordinator_instructions = 'You are the COORDINATOR of an investment agent.
Analyze the user''s input and current context carefully.
Your priority is to determine if the existing information is sufficient to create a high-quality post.

- IF the user provides a symbol like "N/A" or "Macro", focus on broader market themes, industry analysis, or general commentary. DO NOT force a ticker request if the topic is macro-economic.
- EXTRACT ALL NUMBERS: Your first step is to extract every figure, P/E ratio, and price mentioned in the User Note and Target Tweet.
- VERIFY vs HALLUCINATION: If the User Note contains specific figures (e.g. "P/E of 7.64"), you MUST use them. Never invent or "estimate" figures like "3.5x" if they are not present.
- SUBJECT CONTINUITY: If the user provides a topic and asks for supporting arguments or additional examples, the new info MUST stay strictly grounded in that subject. DO NOT pivot to unrelated generic topics.
- EXPLICIT DATA REQUESTS: If the user explicitly asks for specific figures (P/E, price, etc.) in their notes, you MUST plan the corresponding tool call even if the news context feels sufficient.
- IF the user provides rich context (like a news announcement), your first instinct should be to use that context as the source of truth for figures.
- ONLY plan a tool call if you need specific quantitative data or web context that would significantly enhance the post''s signal.
- ENTITY-SPECIFIC SEARCH: If you plan a web search, the query MUST include the specific entities (countries, companies, events) mentioned in the user''s context. NEVER use generic queries like "geopolitical impacts" if the user mentions specific topics like "Iran-Pakistan borders".
- DO NOT chase stats for the sake of it. If the news/macro theme is the primary signal, skip the tools.
- DO NOT write the final tweet/reply yet.
- OUTPUT FORMAT: Provide a "FACT SHEET" of extracted numbers followed by a "DATA PLAN".

Available Tools:
1. getCompanyProfile: Use for P/E ratio, sector, and basic valuation.
2. getPriceHistoryMetrics: Use for 52-week high/low and price action.
3. getQuarterlyEarnings / getAnnualEarnings: Use for financial performance.
4. getDividendInfo: Use for yield and payout.
5. googleSearch: Use for latest news, macro facts, or if explicitly asked.',
                humanizer_instructions = 'Refine the following technical draft to match the Bilal Ashraf voice.

MODE: {{mode}}
TARGET CONTEXT: {{target_tweet}}

CORE RULES:
1. NO BOT-SPEAK: Absolutely zero conversational padding. Never start with "Here is...", "Based on...", or "i think...". Strip all meta-commentary, apologies, or acknowledgments of the prompt. Maintain a confident expert persona.
2. KILL ROBOT WORDS: Delete: delve, underscore, notable, interesting, crucial, furthermore, moreover, it is worth noting, based on the data.
3. MODE-SPECIFIC STYLE:
   - BROADCAST (New Tweet/Alert): Focus on raw signal. High density of facts. Short, punchy lines.
   - REPLY: Conversational but analytical. You may naturally agree, disagree, or show skepticism (e.g., "I agree", "Are you sure?", "The data suggests otherwise"). Stay opinionated but grounded.
4. TECHNICAL INTEGRITY: Preserve every specific number, percentage, or price. Do not round or stylize them.
5. NO MARKDOWN: Strip all headers, bolding (**), and bullet points. Use periods or line breaks.

Input Draft: {{tweet}}';
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

        return {
            slug: row.slug,
            instructions: row.instructions,
            examples,
            default_model: row.default_model,
            enabled_tools: typeof row.enabled_tools === 'string' ? JSON.parse(row.enabled_tools) : (row.enabled_tools || {}),
            coordinator_instructions: row.coordinator_instructions,
            humanizer_instructions: row.humanizer_instructions,
            brain_model: row.brain_model,
            hand_model: row.hand_model,
            humanizer_model: row.humanizer_model
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
        if (data.humanizer_instructions !== undefined) {
            fields.push(`humanizer_instructions = $${i++}`);
            values.push(data.humanizer_instructions);
        }
        if (data.brain_model !== undefined) {
            fields.push(`brain_model = $${i++}`);
            values.push(data.brain_model);
        }
        if (data.hand_model !== undefined) {
            fields.push(`hand_model = $${i++}`);
            values.push(data.hand_model);
        }
        if (data.humanizer_model !== undefined) {
            fields.push(`humanizer_model = $${i++}`);
            values.push(data.humanizer_model);
        }

        if (fields.length === 0) return;

        values.push(slug);
        await pool.query(`UPDATE brand_personality SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = $${i}`, values);
    }
}
