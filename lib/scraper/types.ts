export interface CompanyProfile {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap?: number;
  sharesOutstanding?: number;
  float?: number;
}

export interface FinancialStatement {
  symbol: string;
  periodEndDate: string; // YYYY-MM-DD
  periodType: 'quarterly' | 'annual' | 'ttm';
  fiscalQuarter?: string; // e.g., "Q3 2025", "Q4 2024"
  
  // Income Statement
  revenue?: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingExpenses?: number;
  operatingIncome?: number;
  interestExpense?: number;
  interestIncome?: number;
  currencyGainLoss?: number;
  pretaxIncome?: number;
  incomeTaxExpense?: number;
  netIncome?: number;
  epsDiluted?: number;
  
  // Balance Sheet - Assets
  cashAndEquivalents?: number;
  shortTermInvestments?: number;
  accountsReceivable?: number;
  accruedInterestReceivable?: number;  // Bank-specific: Interest receivable
  otherReceivables?: number;            // Bank-specific: Other receivables
  restrictedCash?: number;               // Bank-specific: Restricted cash
  otherCurrentAssets?: number;          // Bank-specific: Other current assets
  inventory?: number;
  totalCurrentAssets?: number;
  propertyPlantEquipment?: number;
  goodwill?: number;                     // Goodwill
  otherIntangibleAssets?: number;       // Other intangible assets
  longTermDeferredTaxAssets?: number;   // Long-term deferred tax assets
  otherLongTermAssets?: number;         // Other long-term assets
  totalAssets?: number;
  
  // Balance Sheet - Liabilities
  accountsPayable?: number;
  accruedExpenses?: number;             // Bank-specific: Accrued expenses
  accruedInterestPayable?: number;      // Bank-specific: Accrued interest payable
  interestBearingDeposits?: number;     // Bank-specific: Interest bearing deposits
  nonInterestBearingDeposits?: number; // Bank-specific: Non-interest bearing deposits
  totalDeposits?: number;               // Bank-specific: Total deposits
  shortTermBorrowings?: number;         // Bank-specific: Short-term borrowings
  currentPortionLongTermDebt?: number;  // Current portion of long-term debt
  currentPortionLeases?: number;        // Current portion of leases
  currentIncomeTaxesPayable?: number;   // Current income taxes payable
  otherCurrentLiabilities?: number;     // Other current liabilities
  totalCurrentLiabilities?: number;
  totalDebt?: number;                    // Total debt (legacy, may be sum of short/long term)
  longTermDebt?: number;                 // Long-term debt
  longTermLeases?: number;               // Long-term leases
  longTermUnearnedRevenue?: number;      // Long-term unearned revenue
  pensionPostRetirementBenefits?: number; // Pension & post-retirement benefits
  longTermDeferredTaxLiabilities?: number; // Long-term deferred tax liabilities
  otherLongTermLiabilities?: number;    // Other long-term liabilities
  totalLiabilities?: number;
  totalEquity?: number;
  retainedEarnings?: number;
  
  // Cash Flow
  operatingCashFlow?: number;
  capitalExpenditures?: number;
  freeCashFlow?: number;
  dividendsPaid?: number;
  changeInWorkingCapital?: number;
}

