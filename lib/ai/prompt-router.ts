export const PROMPT_SLUGS = {
    FINANCIAL_ANALYST: 'financial-analyst',
    GOVERNANCE_ANALYST: 'governance-analyst',
    EVENT_ANALYST: 'event-analyst'
} as const;

/**
 * Picks the right "Brain" slug based on the announcement title.
 * Used by the AI Parser to fetch the correct system instruction from the database.
 */
export function getPromptSlugByTitle(title: string): string {
    const titleLower = title.toLowerCase();

    // 1. FINANCIALS (Strict Check)
    if (
        (titleLower.includes("financial results") && !titleLower.includes("other than")) ||
        titleLower.includes("dividend") ||
        titleLower.includes("bonus") ||
        titleLower.includes("right shares")
    ) {
        return PROMPT_SLUGS.FINANCIAL_ANALYST;
    }

    // 2. EVENTS & NEWS (The "Wildcard" Brain)
    else if (
        titleLower.includes("material information") ||
        titleLower.includes("board meeting") ||
        titleLower.includes("unusual movement")
    ) {
        return PROMPT_SLUGS.EVENT_ANALYST;
    }

    // 3. GOVERNANCE & INSIDERS (The "People" Brain)
    else if (
        titleLower.includes("disclosure of interest") ||
        titleLower.includes("appointment") ||
        titleLower.includes("change of")
    ) {
        return PROMPT_SLUGS.GOVERNANCE_ANALYST;
    }

    // Default
    else {
        return PROMPT_SLUGS.EVENT_ANALYST;
    }
}
