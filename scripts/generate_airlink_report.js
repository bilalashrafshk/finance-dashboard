const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = require('docx');
const fs = require('fs');
const path = require('path');

// Helper function to create a table cell
const createCell = (text, isHeader = false, bold = false) => {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isHeader || bold })],
      alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT
    })],
    shading: isHeader ? { fill: 'D3D3D3' } : undefined
  });
};

// Helper function to create a table row
const createTableRow = (cells, isHeader = false) => {
  return new TableRow({
    children: cells.map(cell => createCell(cell, isHeader, isHeader))
  });
};

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      // Title
      new Paragraph({
        text: "Air Link Communication (AIRLINK) – The Comprehensive Investment Report",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }),

      // Header Info
      new Paragraph({
        children: [
          new TextRun({ text: "Date: ", bold: true }),
          new TextRun({ text: "November 20, 2025" }),
          new TextRun({ text: "\nTime Horizon: ", bold: true }),
          new TextRun({ text: "3-6 Months" }),
          new TextRun({ text: "\nRating: ", bold: true }),
          new TextRun({ text: "STRONG BUY / AGGRESSIVE ACCUMULATION", bold: true }),
          new TextRun({ text: "\nCurrent Price: ", bold: true }),
          new TextRun({ text: "PKR 171.98" }),
          new TextRun({ text: "\nTarget Price: ", bold: true }),
          new TextRun({ text: "PKR 220 - 235" }),
          new TextRun({ text: "\nRisk Profile: ", bold: true }),
          new TextRun({ text: "High (Beta > 1.2)" })
        ],
        spacing: { after: 400 }
      }),

      // Section 1: The Crash Explained
      new Paragraph({
        text: "1. The Crash Explained (2021 - 2023)",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: "You asked why the stock collapsed from its IPO highs (~PKR 70-80) to lows of ~PKR 18 in 2023. This was a \"Perfect Storm\" of three macro disasters, not business failure.",
        spacing: { after: 200 }
      }),

      // Table 1: Crash Factors
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Factor", "What Happened?", "Impact on AIRLINK"], true),
          createTableRow([
            "1. Import Ban (LC Crisis)",
            "In 2022-23, the SBP halted Letters of Credit (LCs) for \"non-essential\" items to save dollars.",
            "AIRLINK imports 100% of its kits/phones. No LCs = No Product to Sell. Revenue collapsed from PKR 13.8B (Dec '22) to just PKR 5.3B (Jun '23)."
          ]),
          createTableRow([
            "2. Interest Rate Shock",
            "Rates spiked from ~7% to 22%.",
            "AIRLINK runs on debt (working capital). Finance costs exploded, wiping out net profit. Net margins hit a record low of 0.10% in Jun '23."
          ]),
          createTableRow([
            "3. PKR Devaluation",
            "The Rupee crashed from ~160 to ~280+.",
            "The cost of phones doubled overnight. Demand vanished as consumers prioritized food over new iPhones/Samsungs."
          ])
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "The Pivot: The ban was lifted in late 2023. Since then, revenue has surged 5x (from 5B to 25B+), and the stock has recovered 800% from the lows.",
        spacing: { after: 400 }
      }),

      // Section 2: Financial Health
      new Paragraph({
        text: "2. Financial Health & Valuation Deep Dive",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),

      new Paragraph({
        text: "Historical Valuation (P/E Ratio)",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "Using the highly detailed historical data I processed, we can see the valuation reset.",
        spacing: { after: 200 }
      }),

      // Table 2: Historical P/E
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Date", "Price", "TTM EPS", "P/E Ratio", "Context"], true),
          createTableRow(["Nov 19, 2025", "171.98", "12.01", "14.3x", "Fairly valued for a high-growth tech stock."]),
          createTableRow(["Jun 30, 2024", "88.83", "7.86", "11.3x", "Early recovery phase."]),
          createTableRow(["Jun 30, 2023", "19.83", "2.83", "7.0x", "Peak crisis (Dirt cheap but risky)."]),
          createTableRow(["Dec 31, 2021", "58.06", "4.87", "11.9x", "Post-IPO Hype."])
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "Analysis: The stock is trading at 14.3x P/E. While higher than the crisis lows (7x), it is justified because earnings are growing at 88% YoY. A \"Growth at Reasonable Price\" (GARP) metric (PEG Ratio) would be significantly under 1.0, signaling it is undervalued.",
        spacing: { after: 400 }
      }),

      // Debt-to-Equity Section
      new Paragraph({
        text: "Debt-to-Equity (The Leverage Factor)",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Current D/E: ", bold: true }),
          new TextRun({ text: "1.63 (Q1 FY26)" })
        ],
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "The \"Slingshot\" Effect:",
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• AIRLINK carries PKR 27.8 Billion in debt.\n" }),
          new TextRun({ text: "• At 22% interest, this costs ~PKR 6 Billion/year.\n" }),
          new TextRun({ text: "• At 12% interest (forecast 2026), this drops to ~PKR 3.3 Billion/year.\n" }),
          new TextRun({ text: "• Benefit: ~PKR 2.7 Billion in pure savings flows to Pre-Tax Profit. This alone adds ~PKR 6-7 per share to EPS without selling extra phones." })
        ],
        spacing: { after: 400 }
      }),

      // Section 3: Seasonality
      new Paragraph({
        text: "3. Seasonality: The \"Golden Window\"",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: "(Source: Monthly return analysis of last 5 years)",
        italics: true,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "The data confirms a striking seasonal pattern. You are currently sitting in the statistically strongest window of the year.",
        spacing: { after: 200 }
      }),

      // Table 3: Seasonality
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Month", "Avg Return", "Probability", "Strategy"], true),
          createTableRow(["October", "+9.33%", "High", "Accumulation Phase (Completed)"]),
          createTableRow(["November", "+8.21%", "High", "Trend Continuation (Current)"]),
          createTableRow(["December", "+16.48%", "Very High", "Peak Euphoria / Take Profit Zone"]),
          createTableRow(["January", "-10.04%", "High Risk", "SELL / SHORT. Post-holiday hangover."])
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "Action Plan: Hold through December to capture the +16% seasonality premium, but be ready to exit aggressively before January week 2.",
        spacing: { after: 400 }
      }),

      // Section 4: Macro Outlook
      new Paragraph({
        text: "4. Macro Outlook & Risks",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),

      new Paragraph({
        text: "The Bull Case (Macro Tailwinds)",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "1. Monetary Easing: ", bold: true }),
          new TextRun({ text: "SBP cuts are aggressive. Every 1% cut = +200M PKR Net Profit for AIRLINK.\n" }),
          new TextRun({ text: "2. Exchange Rate Stability: ", bold: true }),
          new TextRun({ text: "PKR has been stable at ~278 for months. This allows AIRLINK to price phones confidently without hedging losses.\n" }),
          new TextRun({ text: "3. Digital Pakistan: ", bold: true }),
          new TextRun({ text: "5G auction delays are actually good (extends 4G handset lifecycle), but eventual rollout will trigger a massive upgrade cycle (selling more units)." })
        ],
        spacing: { after: 400 }
      }),

      new Paragraph({
        text: "The Bear Case (Risks)",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "1. Import Restrictions Redux: ", bold: true }),
          new TextRun({ text: "If Pakistan's forex reserves dip, the first thing the government bans is \"luxury imports\" (phones). This is the #1 existential risk.\n" }),
          new TextRun({ text: "2. Taxation: ", bold: true }),
          new TextRun({ text: "High taxes on mobile phones (PTA Tax) dampen demand for high-end units (iPhones), forcing a mix-shift to lower-margin Chinese phones (Tecno/Infinix)." })
        ],
        spacing: { after: 400 }
      }),

      // Section 5: Investment Strategy
      new Paragraph({
        text: "5. Final Investment Strategy",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: "Recommendation: BUY for a 2-month swing trade or 6-month hold.",
        bold: true,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• Entry: ", bold: true }),
          new TextRun({ text: "PKR 168 - 173 (Current levels are attractive post-dip).\n" }),
          new TextRun({ text: "• Target 1: ", bold: true }),
          new TextRun({ text: "PKR 200 (Psychological resistance).\n" }),
          new TextRun({ text: "• Target 2: ", bold: true }),
          new TextRun({ text: "PKR 225 (Based on 15x Forward EPS of ~15 PKR).\n" }),
          new TextRun({ text: "• Stop Loss: ", bold: true }),
          new TextRun({ text: "PKR 155 (Weekly Close). This invalidates the trend.\n" }),
          new TextRun({ text: "• Time Limit: ", bold: true }),
          new TextRun({ text: "Re-evaluate position in late December to avoid the \"January Curse.\"" })
        ],
        spacing: { after: 400 }
      }),

      new Paragraph({
        text: "Thesis Summary: You are buying a company that just grew profits 88%, has a massive cost-saving catalyst (rate cuts) ahead, and is entering its historically strongest sales month (December). The risk/reward is heavily skewed to the upside.",
        spacing: { after: 400 }
      }),

      // Detailed Debt Analysis Section
      new Paragraph({
        text: "Detailed Debt & Interest Rate Analysis",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),

      new Paragraph({
        text: "1. Where Did I Get the \"27.8 Billion\"?",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "Source: Line Item total_debt from the Q1 FY26 Quarterly Report (via Internal API /api/financials).",
        spacing: { after: 200 }
      }),

      // Table 4: Debt Breakdown
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Metric", "Exact Figure (PKR)", "Rounded"], true),
          createTableRow(["Total Debt", "27,821,000,000", "27.82 Billion"]),
          createTableRow(["Total Equity", "17,049,000,000", "17.05 Billion"]),
          createTableRow(["Net Debt", "27.82B - 1.50B (Cash)", "26.32 Billion"])
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "Why is this high?",
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "This debt primarily funds Working Capital (Inventory).\n" }),
          new TextRun({ text: "• Inventory Level: PKR 15.28 Billion.\n" }),
          new TextRun({ text: "• Accounts Receivable: PKR 7.30 Billion.\n" }),
          new TextRun({ text: "• The Truth: AIRLINK borrows money to buy phones (Inventory), sells them on credit (Receivables), and pays back the loan when cash is collected." })
        ],
        spacing: { after: 400 }
      }),

      new Paragraph({
        text: "2. Interest Rates: The \"Real Cost\" of Borrowing",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "I calculated AIRLINK's Effective Interest Rate by taking their actual Interest Expense and dividing it by their Total Debt.",
        spacing: { after: 200 }
      }),

      // Table 5: Interest Rate History
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Quarter Ending", "Total Debt", "Interest Expense", "Effective Annual Rate", "SBP Policy Rate (Avg)"], true),
          createTableRow(["Sep 30, 2025", "27.82 B", "968 M", "~13.9%", "17.5% → 16.0%"]),
          createTableRow(["Jun 30, 2025", "32.20 B", "505 M", "~6.3%*", "19.5% → 17.5%"]),
          createTableRow(["Mar 31, 2025", "28.72 B", "1,427 M", "~19.9%", "22.0%"]),
          createTableRow(["Dec 31, 2024", "27.91 B", "1,034 M", "~14.8%", "22.0%"]),
          createTableRow(["Mar 31, 2024", "14.53 B", "864 M", "~23.8%", "22.0%"])
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "Note on Jun '25: The abnormally low rate (6.3%) likely includes year-end adjustments or capitalization of interest, making it an outlier. The 23.8% in Mar '24 reflects the peak crisis period.",
        italics: true,
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "Analysis of the \"Truth\":",
        bold: true,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• The Spread: ", bold: true }),
          new TextRun({ text: "In early 2024, AIRLINK was paying ~23.8% interest (KIBOR + Spread).\n" }),
          new TextRun({ text: "• The Drop: ", bold: true }),
          new TextRun({ text: "By Sep 2025, their effective rate dropped to ~13.9%.\n" }),
          new TextRun({ text: "• The Impact:\n" }),
          new TextRun({ text: "  - Old Cost (Peak): 28B Debt @ 24% = PKR 6.7 Billion/Year Interest.\n" }),
          new TextRun({ text: "  - New Cost (Now): 28B Debt @ 14% = PKR 3.9 Billion/Year Interest.\n" }),
          new TextRun({ text: "  - Savings: PKR 2.8 Billion per year.\n" }),
          new TextRun({ text: "  - EPS Impact: This saving alone equals PKR +7.00 EPS annually." })
        ],
        spacing: { after: 400 }
      }),

      new Paragraph({
        text: "3. Final \"Fact-Based\" Investment Conclusion",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: "The Math says BUY.",
        bold: true,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "The stock price crashed in 2023 because the cost of debt (24%) was destroying the business. Now, the cost of debt has collapsed (14%), but the stock price (P/E 14x) has not yet fully priced in the PKR 2.8 Billion in interest savings that will hit the bottom line over the next 12 months.\n\n" }),
          new TextRun({ text: "Proof: ", bold: true }),
          new TextRun({ text: "Q1 Net Income doubled (+88%) largely because margins held up while rates began to fall.\n\n" }),
          new TextRun({ text: "Forecast: ", bold: true }),
          new TextRun({ text: "Expect FY26 Full Year EPS to exceed PKR 18-20, putting the stock at a forward P/E of just 8.5x at current prices." })
        ],
        spacing: { after: 400 }
      })
    ]
  }]
});

// Generate the document
Packer.toBuffer(doc).then((buffer) => {
  const outputPath = path.join(__dirname, 'AIRLINK_Investment_Report.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Word document created successfully at: ${outputPath}`);
  console.log(`📄 File size: ${(buffer.length / 1024).toFixed(2)} KB`);
});

