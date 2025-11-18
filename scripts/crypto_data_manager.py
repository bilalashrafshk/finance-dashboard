#!/usr/bin/env python3
"""
Crypto Data Manager
Manages historical cryptocurrency data using pandas and Parquet format.
Fetches data from Binance API and stores/updates locally.
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List

import pandas as pd
import requests


# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "crypto"
DATA_DIR.mkdir(parents=True, exist_ok=True)

BINANCE_API_BASE = "https://api.binance.com/api/v3/klines"


def get_file_path(symbol: str) -> Path:
    """Get the Parquet file path for a crypto symbol."""
    # Normalize symbol: remove special chars, ensure USDT suffix
    normalized = symbol.upper().replace('-', '').replace('_', '').replace('/', '')
    if not normalized.endswith('USDT'):
        normalized = f"{normalized}USDT"
    return DATA_DIR / f"{normalized}.parquet"


def fetch_from_api(symbol: str, limit: int = 1000, start_time: Optional[int] = None, end_time: Optional[int] = None) -> Optional[List[Dict]]:
    """Fetch historical klines data from Binance API."""
    # Normalize symbol
    normalized = symbol.upper().replace('-', '').replace('_', '').replace('/', '')
    if not normalized.endswith('USDT'):
        normalized = f"{normalized}USDT"
    
    params = {
        'symbol': normalized,
        'interval': '1d',  # Daily candles
        'limit': limit,
    }
    
    if start_time:
        params['startTime'] = start_time
    if end_time:
        params['endTime'] = end_time
    
    try:
        response = requests.get(BINANCE_API_BASE, params=params, timeout=30)
        response.raise_for_status()
        klines = response.json()
        
        # Convert klines to our format
        # Binance klines format: [openTime, open, high, low, close, volume, closeTime, ...]
        data = []
        for kline in klines:
            open_time_ms = kline[0]
            date = datetime.fromtimestamp(open_time_ms / 1000).strftime('%Y-%m-%d')
            
            data.append({
                'date': date,
                'open': float(kline[1]),
                'high': float(kline[2]),
                'low': float(kline[3]),
                'close': float(kline[4]),
                'volume': float(kline[5]),
            })
        
        return data
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}", file=sys.stderr)
        return None


def load_stored_data(symbol: str) -> Optional[pd.DataFrame]:
    """Load stored data from Parquet file."""
    file_path = get_file_path(symbol)
    
    if not file_path.exists():
        return None
    
    try:
        df = pd.read_parquet(file_path)
        # Ensure date column is datetime
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
        return df
    except Exception as e:
        print(f"Error loading stored data for {symbol}: {e}", file=sys.stderr)
        return None


def save_data(symbol: str, df: pd.DataFrame) -> bool:
    """Save DataFrame to Parquet file."""
    file_path = get_file_path(symbol)
    
    try:
        df.to_parquet(file_path, index=False, compression="snappy")
        return True
    except Exception as e:
        print(f"Error saving data for {symbol}: {e}", file=sys.stderr)
        return False


def update_data(symbol: str, force_refresh: bool = False) -> Dict:
    """
    Update data for a crypto symbol.
    
    Args:
        symbol: Crypto symbol (e.g., 'BTC', 'BTCUSDT')
        force_refresh: If True, fetch all data from API regardless of stored data
    
    Returns:
        Dict with status, message, and data info
    """
    # Normalize symbol
    normalized = symbol.upper().replace('-', '').replace('_', '').replace('/', '')
    if not normalized.endswith('USDT'):
        normalized = f"{normalized}USDT"
    
    # Load existing data
    stored_df = load_stored_data(normalized) if not force_refresh else None
    
    # Fetch from API - get up to 1000 days (max limit)
    # For longer history, we'd need multiple requests, but 1000 days (~2.7 years) is good for most cases
    api_data = fetch_from_api(normalized, limit=1000)
    
    if not api_data:
        return {
            "status": "error",
            "message": f"Failed to fetch data from API for {normalized}",
            "records_count": 0,
        }
    
    # Convert API data to DataFrame
    df_new = pd.DataFrame(api_data)
    df_new["date"] = pd.to_datetime(df_new["date"])
    df_new = df_new.sort_values("date")
    
    if stored_df is None:
        # No existing data, save all
        saved = save_data(normalized, df_new)
        return {
            "status": "success" if saved else "error",
            "message": f"Initial data saved for {normalized}" if saved else f"Failed to save data for {normalized}",
            "records_count": len(df_new),
            "latest_date": df_new["date"].max().isoformat() if len(df_new) > 0 else None,
        }
    
    # Compare dates to find new records
    stored_latest_date = stored_df["date"].max()
    new_records = df_new[df_new["date"] > stored_latest_date]
    
    if len(new_records) == 0:
        return {
            "status": "success",
            "message": f"No new data for {normalized}",
            "records_count": len(stored_df),
            "new_records_count": 0,
            "latest_date": stored_latest_date.isoformat(),
        }
    
    # Merge: combine stored and new data, remove duplicates
    df_combined = pd.concat([stored_df, new_records], ignore_index=True)
    df_combined = df_combined.drop_duplicates(subset=["date"], keep="last")
    df_combined = df_combined.sort_values("date")
    
    saved = save_data(normalized, df_combined)
    
    return {
        "status": "success" if saved else "error",
        "message": f"Added {len(new_records)} new records for {normalized}" if saved else f"Failed to save data for {normalized}",
        "records_count": len(df_combined),
        "new_records_count": len(new_records),
        "latest_date": df_combined["date"].max().isoformat() if len(df_combined) > 0 else None,
    }


def get_latest_price(symbol: str) -> Optional[Dict]:
    """
    Get the latest price for a symbol from stored data.
    
    Returns:
        Dict with latest price info or None if not found
    """
    normalized = symbol.upper().replace('-', '').replace('_', '').replace('/', '')
    if not normalized.endswith('USDT'):
        normalized = f"{normalized}USDT"
    
    df = load_stored_data(normalized)
    
    if df is None or len(df) == 0:
        return None
    
    latest = df.iloc[-1]  # Last row (most recent)
    
    return {
        "symbol": normalized,
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
        print("Usage: crypto_data_manager.py <command> [symbol] [options]")
        print("Commands:")
        print("  update <symbol> [--force]  - Update data for a symbol")
        print("  price <symbol>             - Get latest price from stored data")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "update":
        if len(sys.argv) < 3:
            print("Error: Symbol required for update command", file=sys.stderr)
            sys.exit(1)
        
        symbol = sys.argv[2]
        force = "--force" in sys.argv
        
        result = update_data(symbol, force_refresh=force)
        print(json.dumps(result, indent=2))
        
    elif command == "price":
        if len(sys.argv) < 3:
            print("Error: Symbol required for price command", file=sys.stderr)
            sys.exit(1)
        
        symbol = sys.argv[2]
        price_data = get_latest_price(symbol)
        
        if price_data:
            print(json.dumps(price_data, indent=2))
        else:
            print(json.dumps({"error": f"No data found for {symbol}"}, indent=2))
            sys.exit(1)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()





