#!/usr/bin/env python3
"""
PSX Data Manager
Manages historical PSX stock data using pandas and Parquet format.
Fetches data from stockanalysis.com API and stores/updates locally.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

import pandas as pd
import requests


# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "psx"
DATA_DIR.mkdir(parents=True, exist_ok=True)

STOCKANALYSIS_API_BASE = "https://stockanalysis.com/api/symbol/a/PSX-{ticker}/history"
API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/138.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://stockanalysis.com/",
}


def get_file_path(ticker: str) -> Path:
    """Get the Parquet file path for a ticker."""
    return DATA_DIR / f"{ticker.upper()}.parquet"


def fetch_from_api(ticker: str) -> Optional[List[Dict]]:
    """Fetch historical data from stockanalysis.com API."""
    url = STOCKANALYSIS_API_BASE.format(ticker=ticker.upper())
    
    try:
        response = requests.get(url, headers=API_HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # API returns data in different formats - handle both
        # Format 1: {"status": "success", "data": [...]}
        # Format 2: Direct array or object with "data" key
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            if "data" in data:
                # Check if status exists and is success, or just return data
                if data.get("status") == "success" or "data" in data:
                    return data["data"]
            # If it's a dict but no "data" key, might be error
            if "status" in data and data.get("status") != "success":
                print(f"API returned error status: {data.get('status')}", file=sys.stderr)
                return None
        return None
    except Exception as e:
        print(f"Error fetching data for {ticker}: {e}", file=sys.stderr)
        return None


def load_stored_data(ticker: str) -> Optional[pd.DataFrame]:
    """Load stored data from Parquet file."""
    file_path = get_file_path(ticker)
    
    if not file_path.exists():
        return None
    
    try:
        df = pd.read_parquet(file_path)
        # Ensure date column is datetime
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
        return df
    except Exception as e:
        print(f"Error loading stored data for {ticker}: {e}", file=sys.stderr)
        return None


def save_data(ticker: str, df: pd.DataFrame) -> bool:
    """Save DataFrame to Parquet file."""
    file_path = get_file_path(ticker)
    
    try:
        df.to_parquet(file_path, index=False, compression="snappy")
        return True
    except Exception as e:
        print(f"Error saving data for {ticker}: {e}", file=sys.stderr)
        return False


def update_data(ticker: str, force_refresh: bool = False) -> Dict:
    """
    Update data for a ticker.
    
    Args:
        ticker: Stock ticker symbol
        force_refresh: If True, fetch all data from API regardless of stored data
    
    Returns:
        Dict with status, message, and data info
    """
    ticker = ticker.upper()
    
    # Load existing data
    stored_df = load_stored_data(ticker) if not force_refresh else None
    
    # Fetch from API
    api_data = fetch_from_api(ticker)
    
    if not api_data:
        return {
            "status": "error",
            "message": f"Failed to fetch data from API for {ticker}",
            "records_count": 0,
        }
    
    # Convert API data to DataFrame
    df_new = pd.DataFrame(api_data)
    
    # Rename columns for consistency
    column_mapping = {
        "t": "date",
        "o": "open",
        "h": "high",
        "l": "low",
        "c": "close",
        "a": "adjusted_close",
        "v": "volume",
        "ch": "change_pct",
    }
    df_new = df_new.rename(columns=column_mapping)
    
    # Convert date to datetime
    df_new["date"] = pd.to_datetime(df_new["date"])
    
    # Sort by date (ascending - oldest first)
    df_new = df_new.sort_values("date")
    
    if stored_df is None:
        # No existing data, save all
        saved = save_data(ticker, df_new)
        return {
            "status": "success" if saved else "error",
            "message": f"Initial data saved for {ticker}" if saved else f"Failed to save data for {ticker}",
            "records_count": len(df_new),
            "latest_date": df_new["date"].max().isoformat() if len(df_new) > 0 else None,
        }
    
    # Compare dates to find new records
    stored_latest_date = stored_df["date"].max()
    new_records = df_new[df_new["date"] > stored_latest_date]
    
    if len(new_records) == 0:
        return {
            "status": "success",
            "message": f"No new data for {ticker}",
            "records_count": len(stored_df),
            "new_records_count": 0,
            "latest_date": stored_latest_date.isoformat(),
        }
    
    # Merge: combine stored and new data, remove duplicates
    df_combined = pd.concat([stored_df, new_records], ignore_index=True)
    df_combined = df_combined.drop_duplicates(subset=["date"], keep="last")
    df_combined = df_combined.sort_values("date")
    
    saved = save_data(ticker, df_combined)
    
    return {
        "status": "success" if saved else "error",
        "message": f"Added {len(new_records)} new records for {ticker}" if saved else f"Failed to save data for {ticker}",
        "records_count": len(df_combined),
        "new_records_count": len(new_records),
        "latest_date": df_combined["date"].max().isoformat() if len(df_combined) > 0 else None,
    }


def get_latest_price(ticker: str) -> Optional[Dict]:
    """
    Get the latest price for a ticker from stored data.
    
    Returns:
        Dict with latest price info or None if not found
    """
    ticker = ticker.upper()
    df = load_stored_data(ticker)
    
    if df is None or len(df) == 0:
        return None
    
    latest = df.iloc[-1]  # Last row (most recent)
    
    return {
        "ticker": ticker,
        "date": latest["date"].isoformat() if pd.notna(latest["date"]) else None,
        "close": float(latest["close"]) if pd.notna(latest["close"]) else None,
        "open": float(latest["open"]) if pd.notna(latest["open"]) else None,
        "high": float(latest["high"]) if pd.notna(latest["high"]) else None,
        "low": float(latest["low"]) if pd.notna(latest["low"]) else None,
        "volume": float(latest["volume"]) if pd.notna(latest["volume"]) else None,
        "change_pct": float(latest["change_pct"]) if pd.notna(latest["change_pct"]) else None,
    }


def main():
    """CLI interface for the data manager."""
    if len(sys.argv) < 2:
        print("Usage: psx_data_manager.py <command> [ticker] [options]")
        print("Commands:")
        print("  update <ticker> [--force]  - Update data for a ticker")
        print("  price <ticker>             - Get latest price from stored data")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "update":
        if len(sys.argv) < 3:
            print("Error: Ticker required for update command", file=sys.stderr)
            sys.exit(1)
        
        ticker = sys.argv[2]
        force = "--force" in sys.argv
        
        result = update_data(ticker, force_refresh=force)
        print(json.dumps(result, indent=2))
        
    elif command == "price":
        if len(sys.argv) < 3:
            print("Error: Ticker required for price command", file=sys.stderr)
            sys.exit(1)
        
        ticker = sys.argv[2]
        price_data = get_latest_price(ticker)
        
        if price_data:
            print(json.dumps(price_data, indent=2))
        else:
            print(json.dumps({"error": f"No data found for {ticker}"}, indent=2))
            sys.exit(1)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

