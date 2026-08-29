import { NextResponse } from "next/server"
import { getDbClient } from "@/lib/portfolio/db-client"

// Stats are a slow-changing display widget - cache for 1 hour to avoid re-querying on every page load
export const revalidate = 3600

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

    // Get total data points from historical_price_data.
    // Use the planner's row estimate (pg_class.reltuples) instead of COUNT(*) - a full
    // COUNT(*) requires scanning every one of the ~1M rows on every request; the estimate
    // is near-instant and accurate to within autovacuum's last ANALYZE, which is plenty
    // for a display stat that's now also cached for an hour.
    const dataPointsResult = await client.query(
      `SELECT reltuples::bigint as count
       FROM pg_class
       WHERE relname = 'historical_price_data'`
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
