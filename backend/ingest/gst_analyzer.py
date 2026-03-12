import pandas as pd
from fuzzywuzzy import fuzz

def analyze_gst(df):
    """
    df expected with columns: Type (Sale/Purchase), GSTIN, Amount, Date
    """
    # Normalize columns: strip whitespace and handle case
    df.columns = [c.strip() for c in df.columns]
    col_map = {c.lower(): c for c in df.columns}
    
    type_col = col_map.get('type')
    gstin_col = col_map.get('gstin')
    amount_col = col_map.get('amount')
    
    if not type_col or not gstin_col:
        print(f"DEBUG: Missing columns in GST CSV. Seen: {list(df.columns)}")
        # Fallback for demo if only GSTIN exists
        if gstin_col and not type_col:
             # Assume all are sales if Type is missing? No, better to fail clearly
             raise KeyError(f"Missing required column 'Type'. Seen: {list(df.columns)}")
        raise KeyError(f"Missing required columns 'Type' or 'GSTIN'. Seen: {list(df.columns)}")

    red_flags = []
    
    # 1. Circular Trading Detection
    sales_rows = df[df[type_col].astype(str).str.lower() == 'sale']
    purchase_rows = df[df[type_col].astype(str).str.lower() == 'purchase']
    
    sales_gstins = set(sales_rows[gstin_col].unique())
    purchase_gstins = set(purchase_rows[gstin_col].unique())
    
    overlap = sales_gstins.intersection(purchase_gstins)
    circular_trading_pct = (len(overlap) / len(sales_gstins)) * 100 if sales_gstins else 0
    
    if circular_trading_pct > 20:
        red_flags.append(f"HIGH RISK: Circular Trading detected ({circular_trading_pct:.1f}%)")

    # 2. Revenue Inflation (Mock GSTR-3B vs 1/2A logic)
    total_sales = sales_rows[amount_col].sum() if amount_col else 0
    total_purchases = purchase_rows[amount_col].sum() if amount_col else 0
    
    if total_sales > total_purchases * 1.5:
         red_flags.append("Potential Revenue Inflation: Sales significantly exceed purchases")

    return {
        "circular_trading_pct": circular_trading_pct,
        "red_flags": red_flags,
        "total_sales": float(total_sales),
        "total_purchases": float(total_purchases)
    }

def analyze_bank_statement(df):
    """
    df expected with columns: Date, Description, Amount, Type (CR/DR)
    """
    # Normalize columns
    df.columns = [c.strip() for c in df.columns]
    desc_col = next((c for c in df.columns if c.lower() == 'description'), None)
    
    if not desc_col:
        print(f"DEBUG: Missing 'Description' column in Bank CSV. Seen: {list(df.columns)}")
        return {"bounce_count": 0, "bounces": []}

    bounces = df[df[desc_col].astype(str).str.contains("BOUNCE|RETURN", case=False, na=False)]
    return {
        "bounce_count": len(bounces),
        "bounces": bounces.to_dict('records')
    }
