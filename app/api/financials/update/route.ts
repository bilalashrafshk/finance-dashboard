import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { scrapeCompanyProfile, scrapeFinancials } from '@/lib/scraper';
import { fetchFaceValue } from '@/lib/scraper/scstrade';
import { updateMarketCapFromPrice } from '@/lib/portfolio/db-client';

// Initialize connection pool (reuse existing env vars)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('DATABASE_URL required');
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const force = searchParams.get('force') === 'true';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    const client = await getPool().connect();

    try {
      // 0. Check Cache (10-day cooldown) unless forced
      if (!force) {
        const cacheRes = await client.query(
          `SELECT last_updated FROM company_profiles WHERE symbol = $1 AND asset_type = 'pk-equity'`,
          [symbol]
        );
        
        if (cacheRes.rows.length > 0 && cacheRes.rows[0].last_updated) {
          const lastUpdated = new Date(cacheRes.rows[0].last_updated);
          const now = new Date();
          const diffDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
          
          if (diffDays < 10) {
            return NextResponse.json({ 
              success: true, 
              status: 'fresh', 
              message: `Data is up to date (updated ${Math.round(diffDays)} days ago).`,
              last_updated: lastUpdated
            });
          }
        }
      }

      // 1. Scrape & Update Profile
      console.log(`Scraping profile for ${symbol}...`);
      const [profile, faceValue] = await Promise.all([
        scrapeCompanyProfile(symbol),
        fetchFaceValue(symbol)
      ]);
      
      console.log(`[Profile] ${symbol}: Face Value = ${faceValue}`);
      
      await client.query(`
        INSERT INTO company_profiles (symbol, asset_type, name, sector, industry, market_cap, shares_outstanding, float_shares, face_value, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (asset_type, symbol) DO UPDATE SET
          name = EXCLUDED.name,
          sector = EXCLUDED.sector,
          industry = EXCLUDED.industry,
          -- Don't update market_cap from external source - it's calculated from price × shares
          -- market_cap will be recalculated after this update
          shares_outstanding = EXCLUDED.shares_outstanding,
          float_shares = EXCLUDED.float_shares,
          face_value = EXCLUDED.face_value,
          last_updated = NOW()
      `, [
        profile.symbol,
        'pk-equity',
        profile.name,
        profile.sector,
        profile.industry,
        profile.marketCap, // Only used for initial insert if profile doesn't exist
        profile.sharesOutstanding,
        profile.float,
        faceValue
      ]);

      // Recalculate market cap based on latest price (don't use external source)
      // This ensures market cap = price × shares outstanding
      await updateMarketCapFromPrice('pk-equity', profile.symbol);

      // 2. Scrape & Update Financials (Quarterly)
      console.log(`Scraping quarterly financials for ${symbol}...`);
      const quarterly = await scrapeFinancials(symbol, 'quarterly');
      
      for (const stat of quarterly) {
        try {
          await client.query(`
            INSERT INTO financial_statements (
              symbol, asset_type, period_end_date, period_type, fiscal_quarter,
              revenue, cost_of_revenue, gross_profit, operating_expenses, operating_income,
              interest_expense, interest_income, currency_gain_loss,
              pretax_income, income_tax_expense, net_income, eps_diluted,
              cash_and_equivalents, short_term_investments, accounts_receivable, accrued_interest_receivable, other_receivables, restricted_cash, other_current_assets, inventory,
              total_current_assets, property_plant_equipment, goodwill, other_intangible_assets, long_term_deferred_tax_assets, other_long_term_assets, total_assets,
              accounts_payable, accrued_expenses, accrued_interest_payable, interest_bearing_deposits, non_interest_bearing_deposits, total_deposits,
              short_term_borrowings, current_portion_long_term_debt, current_portion_leases, current_income_taxes_payable, other_current_liabilities,
              total_current_liabilities, total_debt, long_term_debt, long_term_leases, long_term_unearned_revenue,
              pension_post_retirement_benefits, long_term_deferred_tax_liabilities, other_long_term_liabilities, total_liabilities,
              total_equity, retained_earnings,
              operating_cash_flow, capital_expenditures, free_cash_flow, dividends_paid, change_in_working_capital
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, $13,
              $14, $15, $16, $17,
              $18, $19, $20, $21, $22, $23, $24, $25,
              $26, $27, $28, $29, $30, $31, $32,
              $33, $34, $35, $36, $37, $38,
              $39, $40, $41, $42, $43,
              $44, $45, $46, $47, $48,
              $49, $50, $51, $52,
              $53, $54,
              $55, $56, $57, $58, $59
            )
          ON CONFLICT (asset_type, symbol, period_end_date, period_type) DO UPDATE SET
            fiscal_quarter = EXCLUDED.fiscal_quarter,
            revenue = EXCLUDED.revenue,
            cost_of_revenue = EXCLUDED.cost_of_revenue,
            gross_profit = EXCLUDED.gross_profit,
            operating_expenses = EXCLUDED.operating_expenses,
            operating_income = EXCLUDED.operating_income,
            interest_expense = EXCLUDED.interest_expense,
            interest_income = EXCLUDED.interest_income,
            currency_gain_loss = EXCLUDED.currency_gain_loss,
            pretax_income = EXCLUDED.pretax_income,
            income_tax_expense = EXCLUDED.income_tax_expense,
            net_income = EXCLUDED.net_income,
            eps_diluted = EXCLUDED.eps_diluted,
            cash_and_equivalents = EXCLUDED.cash_and_equivalents,
            short_term_investments = EXCLUDED.short_term_investments,
            accounts_receivable = EXCLUDED.accounts_receivable,
            accrued_interest_receivable = EXCLUDED.accrued_interest_receivable,
            other_receivables = EXCLUDED.other_receivables,
            restricted_cash = EXCLUDED.restricted_cash,
            other_current_assets = EXCLUDED.other_current_assets,
            inventory = EXCLUDED.inventory,
            total_current_assets = EXCLUDED.total_current_assets,
            property_plant_equipment = EXCLUDED.property_plant_equipment,
            goodwill = EXCLUDED.goodwill,
            other_intangible_assets = EXCLUDED.other_intangible_assets,
            long_term_deferred_tax_assets = EXCLUDED.long_term_deferred_tax_assets,
            other_long_term_assets = EXCLUDED.other_long_term_assets,
            total_assets = EXCLUDED.total_assets,
            accounts_payable = EXCLUDED.accounts_payable,
            accrued_expenses = EXCLUDED.accrued_expenses,
            accrued_interest_payable = EXCLUDED.accrued_interest_payable,
            interest_bearing_deposits = EXCLUDED.interest_bearing_deposits,
            non_interest_bearing_deposits = EXCLUDED.non_interest_bearing_deposits,
            total_deposits = EXCLUDED.total_deposits,
            short_term_borrowings = EXCLUDED.short_term_borrowings,
            current_portion_long_term_debt = EXCLUDED.current_portion_long_term_debt,
            current_portion_leases = EXCLUDED.current_portion_leases,
            current_income_taxes_payable = EXCLUDED.current_income_taxes_payable,
            other_current_liabilities = EXCLUDED.other_current_liabilities,
            total_current_liabilities = EXCLUDED.total_current_liabilities,
            total_debt = EXCLUDED.total_debt,
            long_term_debt = EXCLUDED.long_term_debt,
            long_term_leases = EXCLUDED.long_term_leases,
            long_term_unearned_revenue = EXCLUDED.long_term_unearned_revenue,
            pension_post_retirement_benefits = EXCLUDED.pension_post_retirement_benefits,
            long_term_deferred_tax_liabilities = EXCLUDED.long_term_deferred_tax_liabilities,
            other_long_term_liabilities = EXCLUDED.other_long_term_liabilities,
            total_liabilities = EXCLUDED.total_liabilities,
            total_equity = EXCLUDED.total_equity,
            retained_earnings = EXCLUDED.retained_earnings,
            operating_cash_flow = EXCLUDED.operating_cash_flow,
            capital_expenditures = EXCLUDED.capital_expenditures,
            free_cash_flow = EXCLUDED.free_cash_flow,
            dividends_paid = EXCLUDED.dividends_paid,
            change_in_working_capital = EXCLUDED.change_in_working_capital,
            updated_at = NOW()
          `, [
            stat.symbol, 'pk-equity', stat.periodEndDate, stat.periodType,
            stat.revenue, stat.costOfRevenue, stat.grossProfit, stat.operatingExpenses, stat.operatingIncome,
            stat.interestExpense, stat.interestIncome, stat.currencyGainLoss,
            stat.pretaxIncome, stat.incomeTaxExpense, stat.netIncome, stat.epsDiluted,
            stat.cashAndEquivalents, stat.shortTermInvestments, stat.accountsReceivable, stat.accruedInterestReceivable, stat.otherReceivables, stat.restrictedCash, stat.otherCurrentAssets, stat.inventory,
            stat.totalCurrentAssets, stat.propertyPlantEquipment, stat.goodwill, stat.otherIntangibleAssets, stat.longTermDeferredTaxAssets, stat.otherLongTermAssets, stat.totalAssets,
            stat.accountsPayable, stat.accruedExpenses, stat.accruedInterestPayable, stat.interestBearingDeposits, stat.nonInterestBearingDeposits, stat.totalDeposits,
            stat.shortTermBorrowings, stat.currentPortionLongTermDebt, stat.currentPortionLeases, stat.currentIncomeTaxesPayable, stat.otherCurrentLiabilities,
            stat.totalCurrentLiabilities, stat.totalDebt, stat.longTermDebt, stat.longTermLeases, stat.longTermUnearnedRevenue,
            stat.pensionPostRetirementBenefits, stat.longTermDeferredTaxLiabilities, stat.otherLongTermLiabilities, stat.totalLiabilities,
            stat.totalEquity, stat.retainedEarnings,
            stat.operatingCashFlow, stat.capitalExpenditures, stat.freeCashFlow, stat.dividendsPaid, stat.changeInWorkingCapital
          ]);
        } catch (err: any) {
          console.error(`Error inserting period ${stat.periodEndDate} (${stat.periodType}):`, err.message);
          console.error('Sample values:', {
            revenue: stat.revenue,
            netIncome: stat.netIncome,
            totalAssets: stat.totalAssets,
            epsDiluted: stat.epsDiluted
          });
          throw err;
        }
      }
      
      // 3. Scrape & Update Financials (Annual)
      // (Repeating logic for Annual - could refactor, but explicit is fine for now)
      console.log(`Scraping annual financials for ${symbol}...`);
      const annual = await scrapeFinancials(symbol, 'annual');
      for (const stat of annual) {
        try {
          await client.query(`
            INSERT INTO financial_statements (
              symbol, asset_type, period_end_date, period_type, fiscal_quarter,
              revenue, cost_of_revenue, gross_profit, operating_expenses, operating_income,
              interest_expense, interest_income, currency_gain_loss,
              pretax_income, income_tax_expense, net_income, eps_diluted,
              cash_and_equivalents, short_term_investments, accounts_receivable, accrued_interest_receivable, other_receivables, restricted_cash, other_current_assets, inventory,
              total_current_assets, property_plant_equipment, goodwill, other_intangible_assets, long_term_deferred_tax_assets, other_long_term_assets, total_assets,
              accounts_payable, accrued_expenses, accrued_interest_payable, interest_bearing_deposits, non_interest_bearing_deposits, total_deposits,
              short_term_borrowings, current_portion_long_term_debt, current_portion_leases, current_income_taxes_payable, other_current_liabilities,
              total_current_liabilities, total_debt, long_term_debt, long_term_leases, long_term_unearned_revenue,
              pension_post_retirement_benefits, long_term_deferred_tax_liabilities, other_long_term_liabilities, total_liabilities,
              total_equity, retained_earnings,
              operating_cash_flow, capital_expenditures, free_cash_flow, dividends_paid, change_in_working_capital
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, $13,
              $14, $15, $16, $17,
              $18, $19, $20, $21, $22, $23, $24, $25,
              $26, $27, $28, $29, $30, $31, $32,
              $33, $34, $35, $36, $37, $38,
              $39, $40, $41, $42, $43,
              $44, $45, $46, $47, $48,
              $49, $50, $51, $52,
              $53, $54,
              $55, $56, $57, $58, $59
            )
          ON CONFLICT (asset_type, symbol, period_end_date, period_type) DO UPDATE SET
            fiscal_quarter = EXCLUDED.fiscal_quarter,
            revenue = EXCLUDED.revenue,
            cost_of_revenue = EXCLUDED.cost_of_revenue,
            gross_profit = EXCLUDED.gross_profit,
            operating_expenses = EXCLUDED.operating_expenses,
            operating_income = EXCLUDED.operating_income,
            interest_expense = EXCLUDED.interest_expense,
            interest_income = EXCLUDED.interest_income,
            currency_gain_loss = EXCLUDED.currency_gain_loss,
            pretax_income = EXCLUDED.pretax_income,
            income_tax_expense = EXCLUDED.income_tax_expense,
            net_income = EXCLUDED.net_income,
            eps_diluted = EXCLUDED.eps_diluted,
            cash_and_equivalents = EXCLUDED.cash_and_equivalents,
            short_term_investments = EXCLUDED.short_term_investments,
            accounts_receivable = EXCLUDED.accounts_receivable,
            accrued_interest_receivable = EXCLUDED.accrued_interest_receivable,
            other_receivables = EXCLUDED.other_receivables,
            restricted_cash = EXCLUDED.restricted_cash,
            other_current_assets = EXCLUDED.other_current_assets,
            inventory = EXCLUDED.inventory,
            total_current_assets = EXCLUDED.total_current_assets,
            property_plant_equipment = EXCLUDED.property_plant_equipment,
            goodwill = EXCLUDED.goodwill,
            other_intangible_assets = EXCLUDED.other_intangible_assets,
            long_term_deferred_tax_assets = EXCLUDED.long_term_deferred_tax_assets,
            other_long_term_assets = EXCLUDED.other_long_term_assets,
            total_assets = EXCLUDED.total_assets,
            accounts_payable = EXCLUDED.accounts_payable,
            accrued_expenses = EXCLUDED.accrued_expenses,
            accrued_interest_payable = EXCLUDED.accrued_interest_payable,
            interest_bearing_deposits = EXCLUDED.interest_bearing_deposits,
            non_interest_bearing_deposits = EXCLUDED.non_interest_bearing_deposits,
            total_deposits = EXCLUDED.total_deposits,
            short_term_borrowings = EXCLUDED.short_term_borrowings,
            current_portion_long_term_debt = EXCLUDED.current_portion_long_term_debt,
            current_portion_leases = EXCLUDED.current_portion_leases,
            current_income_taxes_payable = EXCLUDED.current_income_taxes_payable,
            other_current_liabilities = EXCLUDED.other_current_liabilities,
            total_current_liabilities = EXCLUDED.total_current_liabilities,
            total_debt = EXCLUDED.total_debt,
            long_term_debt = EXCLUDED.long_term_debt,
            long_term_leases = EXCLUDED.long_term_leases,
            long_term_unearned_revenue = EXCLUDED.long_term_unearned_revenue,
            pension_post_retirement_benefits = EXCLUDED.pension_post_retirement_benefits,
            long_term_deferred_tax_liabilities = EXCLUDED.long_term_deferred_tax_liabilities,
            other_long_term_liabilities = EXCLUDED.other_long_term_liabilities,
            total_liabilities = EXCLUDED.total_liabilities,
            total_equity = EXCLUDED.total_equity,
            retained_earnings = EXCLUDED.retained_earnings,
            operating_cash_flow = EXCLUDED.operating_cash_flow,
            capital_expenditures = EXCLUDED.capital_expenditures,
            free_cash_flow = EXCLUDED.free_cash_flow,
            dividends_paid = EXCLUDED.dividends_paid,
            change_in_working_capital = EXCLUDED.change_in_working_capital,
            updated_at = NOW()
          `, [
            stat.symbol, 'pk-equity', stat.periodEndDate, stat.periodType, stat.fiscalQuarter || null,
            stat.revenue, stat.costOfRevenue, stat.grossProfit, stat.operatingExpenses, stat.operatingIncome,
            stat.interestExpense, stat.interestIncome, stat.currencyGainLoss,
            stat.pretaxIncome, stat.incomeTaxExpense, stat.netIncome, stat.epsDiluted,
            stat.cashAndEquivalents, stat.shortTermInvestments, stat.accountsReceivable, stat.accruedInterestReceivable, stat.otherReceivables, stat.restrictedCash, stat.otherCurrentAssets, stat.inventory,
            stat.totalCurrentAssets, stat.propertyPlantEquipment, stat.goodwill, stat.otherIntangibleAssets, stat.longTermDeferredTaxAssets, stat.otherLongTermAssets, stat.totalAssets,
            stat.accountsPayable, stat.accruedExpenses, stat.accruedInterestPayable, stat.interestBearingDeposits, stat.nonInterestBearingDeposits, stat.totalDeposits,
            stat.shortTermBorrowings, stat.currentPortionLongTermDebt, stat.currentPortionLeases, stat.currentIncomeTaxesPayable, stat.otherCurrentLiabilities,
            stat.totalCurrentLiabilities, stat.totalDebt, stat.longTermDebt, stat.longTermLeases, stat.longTermUnearnedRevenue,
            stat.pensionPostRetirementBenefits, stat.longTermDeferredTaxLiabilities, stat.otherLongTermLiabilities, stat.totalLiabilities,
            stat.totalEquity, stat.retainedEarnings,
            stat.operatingCashFlow, stat.capitalExpenditures, stat.freeCashFlow, stat.dividendsPaid, stat.changeInWorkingCapital
          ]);
        } catch (err: any) {
          console.error(`Error inserting period ${stat.periodEndDate} (${stat.periodType}):`, err.message);
          console.error('Sample values:', {
            revenue: stat.revenue,
            netIncome: stat.netIncome,
            totalAssets: stat.totalAssets,
            epsDiluted: stat.epsDiluted
          });
          throw err;
        }
      }

      return NextResponse.json({ success: true, profile, quarterlyCount: quarterly.length, annualCount: annual.length });

    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
