const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ExternalHyperlink } = require('docx');
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

// Financial data constants
const SHARES_OUTSTANDING = 395270000; // 395.27 million shares
const CURRENT_TTM_EPS = 13.89;
const CURRENT_TTM_NET_INCOME = 5.49; // Billion PKR
const TARGET_EPS = 18.00; // Based on analysis
const TARGET_PE = 15.00; // Based on analysis
const IMPLIED_NET_INCOME = (TARGET_EPS * SHARES_OUTSTANDING) / 1e9; // Convert to billions

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

      // Section 1: Investment Thesis
      new Paragraph({
        text: "1. Investment Thesis & Executive Summary",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: "AIRLINK is a high-growth technology play trading at a discount to its intrinsic value. The company is currently benefiting from a 'triple-tailwind':",
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "1. Monetary Easing: ", bold: true }),
          new TextRun({ text: "Falling interest rates are directly reducing finance costs, boosting net income." }),
          new TextRun({ text: "\n2. Seasonal Strength: ", bold: true }),
          new TextRun({ text: "Entering Q2 (Oct-Dec), historically the strongest quarter for sales." }),
          new TextRun({ text: "\n3. Operational Efficiency: ", bold: true }),
          new TextRun({ text: "Record margins in Q1 FY26 prove the business model is maturing." })
        ],
        spacing: { after: 400 }
      }),

      // Section 2: Business Model Analysis
      new Paragraph({
        text: "2. Business Model Breakdown",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      
      new Paragraph({
        text: "A. Distribution Segment (The Cash Cow)",
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• Partners: ", bold: true }),
          new TextRun({ text: "Official distributor for Samsung, Huawei, Xiaomi, Tecno, Itel, TCL, and authorized reseller for Apple.\n" }),
          new TextRun({ text: "• Revenue Contribution: ", bold: true }),
          new TextRun({ text: "~60-70% of total revenue.\n" }),
          new TextRun({ text: "• Source: ", bold: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "Air Link Official Company Profile", style: "Hyperlink" })],
            link: "https://www.airlinkcommunication.com/company-profile/"
          })
        ],
        spacing: { after: 200 }
      }),

      new Paragraph({
        text: "B. Manufacturing/Assembly (The Growth Engine)",
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "• Facility: ", bold: true }),
          new TextRun({ text: "State-of-the-art plant in Lahore (250,000 sq. ft) with capacity of ~12 million units/year.\n" }),
          new TextRun({ text: "• Key Contract: ", bold: true }),
          new TextRun({ text: "Assembling Xiaomi phones locally to avoid high import duties (CBU).\n" }),
          new TextRun({ text: "• Expansion: ", bold: true }),
          new TextRun({ text: "Producing 360,000 Google-Certified Smart TVs annually.\n" }),
          new TextRun({ text: "• Source: ", bold: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "Manufacturing Capabilities", style: "Hyperlink" })],
            link: "https://www.airlinkcommunication.com/company-profile/"
          })
        ],
        spacing: { after: 400 }
      }),

      // Section 3: Financial Analysis
      new Paragraph({
        text: "3. Financial Health & Projections",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),

      // Historic EPS Table
      new Paragraph({
        text: "Historic Earnings Performance",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Fiscal Year", "Annual EPS (PKR)", "Net Income (PKR Billion)", "YoY Growth"], true),
          createTableRow(["FY2026 (Q1 Only)", "4.01", "1.58", "N/A"]),
          createTableRow(["FY2025", "12.01", "4.75", "+104%"]),
          createTableRow(["FY2024", "11.70", "4.63", "+374%"]),
          createTableRow(["FY2023", "2.50", "0.96", "-37%"]),
          createTableRow(["FY2022", "4.30", "1.65", "-64%"])
        ],
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Source: ", bold: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "Air Link Investor Information", style: "Hyperlink" })],
            link: "https://www.airlinkcommunication.com/investor-information/"
          })
        ],
        spacing: { after: 400 }
      }),

      // Debt Analysis
      new Paragraph({
        text: "Debt Analysis: The Interest Rate Arbitrage",
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Total Debt: ", bold: true }),
          new TextRun({ text: "PKR 27.82 Billion (as of Sep 30, 2025).\n" }),
          new TextRun({ text: "Source: ", bold: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "Q1 FY26 Financial Statements", style: "Hyperlink" })],
            link: "https://www.airlinkcommunication.com/investor-information/"
          }),
          new TextRun({ text: "\n\nThe Opportunity: ", bold: true }),
          new TextRun({ text: "In early 2024, AIRLINK paid ~24% interest. With SBP rates falling to 11-13%, finance costs are dropping sharply, boosting EPS." })
        ],
        spacing: { after: 400 }
      }),

      // Section 4: Seasonality
      new Paragraph({
        text: "4. Seasonality Analysis: The 'Golden Window'",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        text: "Historical data (last 5 years) confirms Q4 (Oct-Dec) is the optimal holding period.",
        spacing: { after: 200 }
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          createTableRow(["Month", "Avg Return", "Recommendation"], true),
          createTableRow(["October", "+9.33%", "BUY"]),
          createTableRow(["November", "+8.21%", "HOLD / ACCUMULATE"]),
          createTableRow(["December", "+16.48%", "TAKE PROFIT"]),
          createTableRow(["January", "-10.04%", "SELL / AVOID"])
        ],
        spacing: { after: 400 }
      }),

      // Section 5: Macro Outlook
      new Paragraph({
        text: "5. Macro Outlook & Verification",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "1. Monetary Easing: ", bold: true }),
          new TextRun({ text: "SBP cuts from 22% to 11-13% are confirmed.\n" }),
          new TextRun({ text: "   Source: ", italics: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "SBP Monetary Policy (Latest)", style: "Hyperlink" })],
            link: "https://www.sbp.org.pk/m_policy/index.asp"
          }),
          new TextRun({ text: "\n\n" }),
          new TextRun({ text: "2. Inflation Trends: ", bold: true }),
          new TextRun({ text: "Inflation dropped to 3.2% in mid-2025 before stabilizing at 5.6%.\n" }),
          new TextRun({ text: "   Source: ", italics: true }),
          new ExternalHyperlink({
            children: [new TextRun({ text: "PBS Inflation Reports", style: "Hyperlink" })],
            link: "https://www.pbs.gov.pk/cpi"
          })
        ],
        spacing: { after: 400 }
      }),

      // Section 6: Risks
      new Paragraph({
        text: "6. Key Risks to Watch",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "1. Import Ban Risk: ", bold: true }),
          new TextRun({ text: "If forex reserves dip, phones are the first to be restricted. This crushed revenue in 2023.\n" }),
          new TextRun({ text: "2. Exchange Rate: ", bold: true }),
          new TextRun({ text: "PKR depreciation hurts margins. Stability around 278/USD is critical." })
        ],
        spacing: { after: 400 }
      }),

      // Section 7: Final Strategy
      new Paragraph({
        text: "7. Final Investment Strategy",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Recommendation: ", bold: true }),
          new TextRun({ text: "BUY\n" }),
          new TextRun({ text: "Entry Zone: ", bold: true }),
          new TextRun({ text: "PKR 168 - 173\n" }),
          new TextRun({ text: "Target Price: ", bold: true }),
          new TextRun({ text: "PKR 220 - 235\n" }),
          new TextRun({ text: "Stop Loss: ", bold: true }),
          new TextRun({ text: "Closing below PKR 155\n" }),
          new TextRun({ text: "Timeframe: ", bold: true }),
          new TextRun({ text: "Hold until late December 2025." })
        ],
        spacing: { after: 400 }
      })
    ]
  }]
});

// Generate the document
Packer.toBuffer(doc).then((buffer) => {
  const outputPath = path.join(__dirname, 'AIRLINK_Report_Final_Corrected.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Final Corrected Word document created successfully at: ${outputPath}`);
});

