#!/usr/bin/env python3
"""
SPX500 Data Manager
Manages historical S&P 500 index data using pandas and Parquet format.
Fetches data from Investing.com API and stores/updates locally.
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
DATA_DIR = Path(__file__).parent.parent / "data" / "spx500"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# S&P 500 Index instrument ID from Investing.com
SPX500_INSTRUMENT_ID = "166"

INVESTING_API_BASE = "https://api.investing.com/api/financialdata/historical"
API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8,tr;q=0.7,zh-CN;q=0.6,zh;q=0.5,ru;q=0.4",
    "Origin": "https://www.investing.com",
    "Referer": "https://www.investing.com/",
    "domain-id": "www",
    "Sec-CH-UA": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Priority": "u=1, i",
}


def get_file_path() -> Path:
    """Get the Parquet file path for SPX500."""
    return DATA_DIR / "SPX500.parquet"


def fetch_from_api(start_date: Optional[str] = None, end_date: Optional[str] = None) -> Optional[List[Dict]]:
    """
    Fetch historical data from Investing.com API.
    
    Args:
        start_date: Start date in YYYY-MM-DD format (optional)
        end_date: End date in YYYY-MM-DD format (optional, defaults to today)
    
    Returns:
        List of data points or None if error
    """
    from datetime import datetime, timedelta
    
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")
    
    if not start_date:
        # Default to 1996-01-01 (as used in the working browser request)
        start_date = "1996-01-01"
    
    url = f"{INVESTING_API_BASE}/{SPX500_INSTRUMENT_ID}"
    
    params = {
        "start-date": start_date,
        "end-date": end_date,
        "time-frame": "Daily",
        "add-missing-rows": "false",
    }
    
    try:
        # Use a session to maintain cookies (helps with Cloudflare)
        session = requests.Session()
        session.headers.update(API_HEADERS)
        
        response = session.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        # Check if response is HTML (Cloudflare challenge)
        content_type = response.headers.get("content-type", "")
        if "text/html" in content_type:
            print("Warning: Received HTML response (likely Cloudflare protection)", file=sys.stderr)
            return None
        
        # Handle gzip/deflate encoding automatically
        data = response.json()
        
        # API returns data in format: {"data": [...]}
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        elif isinstance(data, list):
            return data
        else:
            print(f"Unexpected API response format: {type(data)}", file=sys.stderr)
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from API: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON response: {e}", file=sys.stderr)
        print(f"Response preview: {response.text[:200]}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Unexpected error fetching data: {e}", file=sys.stderr)
        return None


def load_stored_data() -> Optional[pd.DataFrame]:
    """Load stored data from Parquet file."""
    file_path = get_file_path()
    
    if not file_path.exists():
        return None
    
    try:
        df = pd.read_parquet(file_path)
        # Ensure date column is datetime
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
        return df
    except Exception as e:
        print(f"Error loading stored data: {e}", file=sys.stderr)
        return None


def save_data(df: pd.DataFrame) -> bool:
    """Save DataFrame to Parquet file."""
    file_path = get_file_path()
    
    try:
        df.to_parquet(file_path, index=False, compression="snappy")
        return True
    except Exception as e:
        print(f"Error saving data: {e}", file=sys.stderr)
        return False


def parse_investing_data(api_data: List[Dict]) -> pd.DataFrame:
    """
    Parse Investing.com API response into DataFrame.
    
    API response format:
    {
        "rowDate": "Nov 24, 2014",
        "rowDateTimestamp": "2014-11-24T00:00:00.000Z",
        "last_close": "2,067.56",
        "last_open": "2,065.17",
        "last_max": "2,071.46",
        "last_min": "2,062.35",
        "volume": "2.5B",
        "last_closeRaw": "2067.56",  # Optional
        ...
    }
    """
    records = []
    
    for entry in api_data:
        # Parse date
        date_str = entry.get("rowDateTimestamp") or entry.get("rowDate")
        if not date_str:
            continue
        
        try:
            # Try parsing ISO format first
            if "T" in date_str:
                date_obj = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            else:
                # Parse "Nov 24, 2014" format
                date_obj = datetime.strptime(date_str, "%b %d, %Y")
            
            date_iso = date_obj.strftime("%Y-%m-%d")
        except Exception as e:
            print(f"Error parsing date '{date_str}': {e}", file=sys.stderr)
            continue
        
        # Parse numbers - prefer Raw values if available, otherwise parse formatted strings
        def parse_number(field: str, raw_field: Optional[str] = None) -> Optional[float]:
            if raw_field and entry.get(raw_field):
                try:
                    return float(entry[raw_field])
                except (ValueError, TypeError):
                    pass
            
            value_str = entry.get(field, "")
            if not value_str:
                return None
            
            try:
                # Remove commas and parse
                cleaned = str(value_str).replace(",", "").strip()
                return float(cleaned)
            except (ValueError, TypeError):
                return None
        
        def parse_volume(vol_str: Optional[str]) -> Optional[float]:
            if not vol_str:
                return None
            
            try:
                cleaned = str(vol_str).replace(",", "").upper().strip()
                if cleaned.endswith("B"):
                    return float(cleaned.replace("B", "")) * 1_000_000_000
                elif cleaned.endswith("M"):
                    return float(cleaned.replace("M", "")) * 1_000_000
                elif cleaned.endswith("K"):
                    return float(cleaned.replace("K", "")) * 1_000
                else:
                    return float(cleaned)
            except (ValueError, TypeError):
                return None
        
        record = {
            "date": date_iso,
            "open": parse_number("last_open", "last_openRaw"),
            "high": parse_number("last_max", "last_maxRaw"),
            "low": parse_number("last_min", "last_minRaw"),
            "close": parse_number("last_close", "last_closeRaw"),
            "volume": parse_volume(entry.get("volume")),
        }
        
        records.append(record)
    
    if not records:
        return pd.DataFrame()
    
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")  # Sort oldest first
    
    return df


def update_data(force_refresh: bool = False) -> Dict:
    """
    Update data for SPX500.
    
    Args:
        force_refresh: If True, fetch all data from API regardless of stored data
    
    Returns:
        Dict with status, message, and data info
    """
    # Load existing data
    stored_df = load_stored_data() if not force_refresh else None
    
    # Determine date range for API call
    if stored_df is not None and not force_refresh:
        # Fetch from last stored date to today
        stored_latest_date = stored_df["date"].max()
        start_date = (stored_latest_date + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        # Fetch all available data (last 10 years)
        start_date = None
    
    end_date = datetime.now().strftime("%Y-%m-%d")
    
    # Fetch from API
    api_data = fetch_from_api(start_date, end_date)
    
    if not api_data:
        return {
            "status": "error",
            "message": "Failed to fetch data from API",
            "records_count": 0,
        }
    
    # Parse API data
    df_new = parse_investing_data(api_data)
    
    if df_new.empty:
        return {
            "status": "error",
            "message": "No data parsed from API response",
            "records_count": 0,
        }
    
    if stored_df is None:
        # No existing data, save all
        saved = save_data(df_new)
        return {
            "status": "success" if saved else "error",
            "message": f"Initial data saved for SPX500" if saved else "Failed to save data",
            "records_count": len(df_new),
            "latest_date": df_new["date"].max().isoformat() if len(df_new) > 0 else None,
        }
    
    # Compare dates to find new records
    stored_latest_date = stored_df["date"].max()
    new_records = df_new[df_new["date"] > stored_latest_date]
    
    if len(new_records) == 0:
        return {
            "status": "success",
            "message": "No new data for SPX500",
            "records_count": len(stored_df),
            "new_records_count": 0,
            "latest_date": stored_latest_date.isoformat(),
        }
    
    # Merge: combine stored and new data, remove duplicates
    df_combined = pd.concat([stored_df, new_records], ignore_index=True)
    df_combined = df_combined.drop_duplicates(subset=["date"], keep="last")
    df_combined = df_combined.sort_values("date")
    
    saved = save_data(df_combined)
    
    return {
        "status": "success" if saved else "error",
        "message": f"Added {len(new_records)} new records for SPX500" if saved else "Failed to save data",
        "records_count": len(df_combined),
        "new_records_count": len(new_records),
        "latest_date": df_combined["date"].max().isoformat() if len(df_combined) > 0 else None,
    }


def get_latest_price() -> Optional[Dict]:
    """
    Get the latest price for SPX500 from stored data.
    
    Returns:
        Dict with latest price info or None if not found
    """
    df = load_stored_data()
    
    if df is None or len(df) == 0:
        return None
    
    latest = df.iloc[-1]  # Last row (most recent)
    
    return {
        "symbol": "SPX500",
        "date": latest["date"].isoformat() if pd.notna(latest["date"]) else None,
        "close": float(latest["close"]) if pd.notna(latest["close"]) else None,
        "open": float(latest["open"]) if pd.notna(latest["open"]) else None,
        "high": float(latest["high"]) if pd.notna(latest["high"]) else None,
        "low": float(latest["low"]) if pd.notna(latest["low"]) else None,
        "volume": float(latest["volume"]) if pd.notna(latest["volume"]) else None,
    }


def main():
    """CLI interface for the data manager."""
    if len(sys.argv) < 2:
        print("Usage: spx500_data_manager.py <command> [options]")
        print("Commands:")
        print("  update [--force]  - Update data for SPX500")
        print("  price             - Get latest price from stored data")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "update":
        force = "--force" in sys.argv
        
        result = update_data(force_refresh=force)
        print(json.dumps(result, indent=2))
        
    elif command == "price":
        price_data = get_latest_price()
        
        if price_data:
            print(json.dumps(price_data, indent=2))
        else:
            print(json.dumps({"error": "No data found for SPX500"}, indent=2))
            sys.exit(1)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

