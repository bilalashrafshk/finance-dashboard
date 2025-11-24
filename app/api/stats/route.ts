import { NextResponse } from "next/server"
import { getDbClient } from "@/lib/portfolio/db-client"

export async function GET() {
  let client = null
  try {
    client = await getDbClient()

    // Get count of PK companies
    const pkCompaniesResult = await client.query(
      `SELECT COUNT(DISTINCT symbol) as count 
       FROM company_profiles 
       WHERE asset_type = 'pk-equity'`
    )
    const pkCompanies = parseInt(pkCompaniesResult.rows[0]?.count || "0", 10)

    // Get count of US companies
    const usCompaniesResult = await client.query(
      `SELECT COUNT(DISTINCT symbol) as count 
       FROM company_profiles 
       WHERE asset_type = 'us-equity'`
    )
    const usCompanies = parseInt(usCompaniesResult.rows[0]?.count || "0", 10)

    // Get total data points from historical_price_data
    const dataPointsResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM historical_price_data`
    )
    const dataPoints = parseInt(dataPointsResult.rows[0]?.count || "0", 10)

    // Chart count is static - count from charts registry
    const chartCount = 25 // Based on ChartId type in charts-registry.tsx

    return NextResponse.json({
      success: true,
      stats: {
        totalCompanies: pkCompanies + usCompanies,
        pkCompanies,
        usCompanies,
        dataPoints,
        chartCount,
      },
    })
  } catch (error) {
    console.error("Error fetching stats:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch stats",
        stats: {
          totalCompanies: 0,
          pkCompanies: 0,
          usCompanies: 0,
          dataPoints: 0,
          chartCount: 25,
        },
      },
      { status: 500 }
    )
  } finally {
    if (client) {
      client.release()
    }
  }
}
