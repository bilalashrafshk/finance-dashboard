const https = require('https');

function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

async function main() {
  try {
    const financials = await fetchData('https://finance-dashboard-six-snowy.vercel.app/api/financials?symbol=AIRLINK&period=quarterly');
    
    if (!financials || !financials.financials) {
      console.log("No data found");
      return;
    }

    // Sort by date descending (newest first)
    const data = financials.financials.sort((a, b) => new Date(b.period_end_date) - new Date(a.period_end_date));

    // Calculate TTM EPS (last 4 quarters)
    const last4Quarters = data.slice(0, 4);
    const ttmEps = last4Quarters.reduce((sum, q) => sum + (parseFloat(q.eps_diluted) || 0), 0);
    const ttmNetIncome = last4Quarters.reduce((sum, q) => sum + (parseFloat(q.net_income) || 0), 0);

    // Historic annual EPS (sum of 4 quarters per fiscal year)
    const annualData = {};
    data.forEach(q => {
      const date = new Date(q.period_end_date);
      const month = date.getMonth() + 1;
      let fiscalYear;
      if (month >= 7 && month <= 9) fiscalYear = date.getFullYear() + 1;
      else if (month >= 10 && month <= 12) fiscalYear = date.getFullYear() + 1;
      else fiscalYear = date.getFullYear();
      
      if (!annualData[fiscalYear]) annualData[fiscalYear] = [];
      annualData[fiscalYear].push(q);
    });

    const historicAnnual = Object.keys(annualData).sort((a, b) => b - a).slice(0, 5).map(year => {
      const quarters = annualData[year].slice(0, 4);
      const annualEps = quarters.reduce((sum, q) => sum + (parseFloat(q.eps_diluted) || 0), 0);
      const annualNetIncome = quarters.reduce((sum, q) => sum + (parseFloat(q.net_income) || 0), 0);
      return {
        year: `FY${year}`,
        eps: annualEps.toFixed(2),
        netIncome: (annualNetIncome / 1e9).toFixed(2) + ' B'
      };
    });

    console.log(JSON.stringify({
      currentTTM: {
        eps: ttmEps.toFixed(2),
        netIncome: (ttmNetIncome / 1e9).toFixed(2) + ' B'
      },
      historicAnnual,
      sharesOutstanding: parseFloat(financials.profile.shares_outstanding || 0)
    }, null, 2));

  } catch (e) {
    console.error(e);
  }
}

main();


