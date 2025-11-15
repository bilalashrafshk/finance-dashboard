# Scripts Directory

This directory contains Python scripts for data management.

## PSX Data Manager

**File**: `psx_data_manager.py`

Manages historical PSX stock data using pandas and Parquet format.

### Setup

Install Python dependencies:
```bash
pip install -r requirements.txt
```

### Usage

#### Update Data
```bash
python3 scripts/psx_data_manager.py update PTC
python3 scripts/psx_data_manager.py update PTC --force  # Force refresh all data
```

#### Get Latest Price
```bash
python3 scripts/psx_data_manager.py price PTC
```

### Data Storage

- **Location**: `data/psx/{TICKER}.parquet`
- **Format**: Parquet (compressed with Snappy)
- **Update**: Automatically appends new records when updating

### Integration

The script is called via Next.js API routes:
- `/api/psx/data?ticker=PTC&action=update` - Updates data
- `/api/psx/data?ticker=PTC&action=price` - Gets latest price

See `docs/PSX_DATA_METHODS.md` for detailed documentation.


