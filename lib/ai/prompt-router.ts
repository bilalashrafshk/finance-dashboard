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

    // 1. FINANCIALS & PAYOUTS (The "Numbers" Brain)
    if (
        titleLower.includes("financial results") ||
        titleLower.includes("dividend") ||
        titleLower.includes("bonus") ||
        titleLower.includes("right shares")
    ) {
        return PROMPT_SLUGS.FINANCIAL_ANALYST;
    }

    // 2. GOVERNANCE & INSIDERS (The "People" Brain)
    else if (
        titleLower.includes("disclosure of interest") ||
        titleLower.includes("appointment") ||
        titleLower.includes("change of")
    ) {
        return PROMPT_SLUGS.GOVERNANCE_ANALYST;
    }

    // 3. NEWS & EVENTS (The "Wildcard" Brain)
    // Covers "Material Information" and "Board Meeting"
    else {
        return PROMPT_SLUGS.EVENT_ANALYST;
    }
}
