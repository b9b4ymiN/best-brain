#!/usr/bin/env python3
"""
SET50 ROE Scanner - ระบบสแกนหุ้น SET50 ที่ผ่าน ROE > 20%

Uses yfinance to fetch financial data and filter by Return on Equity.

Usage:
    python scripts/set50_roe_scanner.py
    python scripts/set50_roe_scanner.py --min-roe 15 --output json
    python scripts/set50_roe_scanner.py --symbols PTT,BDMS,SCB
"""

import argparse
import io
import json
import sys
from datetime import datetime

# Fix Windows console encoding for Thai/Unicode output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from math import isnan
from typing import Any

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance is required. Install with: pip install yfinance")
    sys.exit(1)


# SET50 symbols (as of 2024) - .BK suffix for Thai stocks in yfinance
SET50_SYMBOLS = [
    "AOT.BK", "BANPU.BK", "BBL.BK", "BDMS.BK", "BEM.BK",
    "BGRIM.BK", "BH.BK", "BTS.BK", "CBG.BK", "CENTEL.BK",
    "CPALL.BK", "CPF.BK", "CPN.BK", "CRC.BK", "DELTA.BK",
    "EA.BK", "EGCO.BK", "GLOBAL.BK", "GPSC.BK", "GULF.BK",
    "HANA.BK", "HMPRO.BK", "INTUCH.BK", "IVL.BK", "KBANK.BK",
    "KCE.BK", "KEX.BK", "KKP.BK", "KTB.BK", "KTC.BK",
    "LH.BK", "MINT.BK", "MTC.BK", "OR.BK", "OSP.BK",
    "PLANB.BK", "PRM.BK", "PSL.BK", "PTT.BK", "PTTEP.BK",
    "PTTGC.BK", "RATCH.BK", "SAWAD.BK", "SCB.BK", "SCC.BK",
    "SPALI.BK", "SPRC.BK", "STEC.BK", "TISCO.BK", "TOP.BK",
    "TPIPP.BK", "TRUE.BK", "TTA.BK", "TTB.BK", "TU.BK",
]


def calculate_roe(ticker_info: dict[str, Any]) -> float | None:
    """
    Calculate Return on Equity from ticker info.

    ROE = (Net Income / Shareholder's Equity) * 100

    Returns None if data is unavailable.
    """
    net_income = ticker_info.get("netIncomeToCommon")
    shareholders_equity = ticker_info.get("totalStockholderEquity")

    if net_income is None or shareholders_equity is None or shareholders_equity == 0:
        return None

    return (net_income / shareholders_equity) * 100


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except Exception:
        return None
    if isnan(number):
        return None
    return number


def _first_available_statement_value(statement: Any, row_names: list[str]) -> float | None:
    """Return the first numeric value for the provided row names from latest to oldest period."""
    if statement is None or getattr(statement, "empty", True):
        return None

    columns = list(getattr(statement, "columns", []))
    if len(columns) == 0:
        return None

    for column in columns:
        for row_name in row_names:
            if row_name not in statement.index:
                continue
            value = statement.loc[row_name, column]
            if hasattr(value, "iloc"):
                try:
                    value = value.iloc[0]
                except Exception:
                    value = None
            number = _to_number(value)
            if number is not None:
                return number
    return None


def fetch_stock_data(symbol: str) -> dict[str, Any] | None:
    """Fetch financial data for a single stock using yfinance."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        if not info:
            info = {}

        net_income = _to_number(info.get("netIncomeToCommon"))
        total_equity = _to_number(info.get("totalStockholderEquity"))

        # Try to get data from financial statements if not in info
        if net_income is None or total_equity is None:
            income_stmt = None
            balance_sheet = None

            try:
                income_stmt = ticker.income_stmt
            except Exception:
                income_stmt = None

            try:
                balance_sheet = ticker.balance_sheet
            except Exception:
                balance_sheet = None

            if net_income is None:
                net_income = _first_available_statement_value(
                    income_stmt,
                    [
                        "Net Income",
                        "Net Income Common Stockholders",
                        "Net Income Including Noncontrolling Interests",
                        "Net Income From Continuing Operation Net Minority Interest",
                    ],
                )
            if total_equity is None:
                total_equity = _first_available_statement_value(
                    balance_sheet,
                    [
                        "Total Stockholder Equity",
                        "Stockholders Equity",
                        "Common Stock Equity",
                        "Total Equity",
                    ],
                )

        if net_income is not None:
            info["netIncomeToCommon"] = net_income
        if total_equity is not None:
            info["totalStockholderEquity"] = total_equity

        return info
    except Exception as e:
        print(f"Warning: Failed to fetch {symbol}: {e}", file=sys.stderr)
        return None


def scan_set50_roe(
    symbols: list[str] | None = None,
    min_roe: float = 20.0,
    verbose: bool = False,
) -> dict[str, Any]:
    """
    Scan SET50 stocks and filter by Return on Equity.

    Args:
        symbols: List of symbols to scan (default: all SET50)
        min_roe: Minimum Return on Equity percentage (default: 20%)
        verbose: Print progress information

    Returns:
        Scanner report dictionary
    """
    scan_symbols = symbols if symbols else SET50_SYMBOLS
    generated_at = datetime.now().isoformat()

    results = []
    passed_count = 0
    failed_data_count = 0

    for symbol in scan_symbols:
        if verbose:
            print(f"Scanning {symbol}...", end=" ")

        info = fetch_stock_data(symbol)

        if info is None:
            if verbose:
                print("FAILED (no data)")
            failed_data_count += 1
            continue

        roe = calculate_roe(info)
        company_name = info.get("longName", info.get("shortName", symbol))
        sector = info.get("sector", "N/A")
        industry = info.get("industry", "N/A")
        market_cap = info.get("marketCap")

        if roe is None:
            if verbose:
                print(f"FAILED (N/A)")
            results.append({
                "ticker": symbol,
                "roe_percent": None,
                "passed": False,
                "company_name": company_name,
                "sector": sector,
                "industry": industry,
                "market_cap": market_cap,
                "rationale": "ROE data unavailable",
            })
            continue

        passed = roe >= min_roe
        if passed:
            passed_count += 1

        result = {
            "ticker": symbol,
            "roe_percent": round(roe, 2),
            "passed": passed,
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
            "market_cap": market_cap,
            "rationale": f"ROE {roe:.2f}% {'>=' if passed else '<'} {min_roe}%",
        }

        results.append(result)

        if verbose:
            status = "PASS" if passed else "FAIL"
            print(f"{status} (ROE: {roe:.2f}%)")

    # Sort by ROE descending (put None values at end)
    results.sort(key=lambda x: x["roe_percent"] if x["roe_percent"] is not None else -1, reverse=True)

    report = {
        "objective": f"Scan SET50 stocks with ROE >= {min_roe}%",
        "generated_at": generated_at,
        "market_date": datetime.now().strftime("%Y-%m-%d"),
        "criteria": {
            "min_roe": min_roe,
            "symbols_scanned": len(scan_symbols),
        },
        "results": results,
        "passed_count": passed_count,
        "total_scanned": len(scan_symbols),
        "failed_data_count": failed_data_count,
        "evidence_chain": {
            "data_source": "yfinance",
            "confidence": 0.95 if failed_data_count == 0 else 0.80,
        },
    }

    return report


def format_markdown_report(report: dict[str, Any]) -> str:
    """Format scanner report as markdown for owner-facing output."""
    lines = [
        f"# SET50 ROE Scanner Report",
        "",
        f"**Objective:** {report['objective']}",
        f"**Market Date:** {report['market_date']}",
        f"**Generated At:** {report['generated_at']}",
        "",
        "## Screening Criteria",
        f"- Minimum ROE: {report['criteria']['min_roe']}%",
        f"- Symbols Scanned: {report['criteria']['symbols_scanned']}",
        "",
        "## Results",
        "| Ticker | Company | ROE (%) | Sector | Passed | Rationale |",
        "|--------|---------|---------|--------|--------|-----------|",
    ]

    for result in report["results"]:
        roe = result["roe_percent"] if result["roe_percent"] is not None else "N/A"
        passed = "✓" if result["passed"] else "✗"
        company = result["company_name"][:20] if result["company_name"] else result["ticker"]
        lines.append(
            f"| {result['ticker']} | {company} | {roe} | {result['sector']} | {passed} | {result['rationale']} |"
        )

    lines.extend([
        "",
        "## Summary",
        f"- Total Scanned: {report['total_scanned']}",
        f"- Passed Criteria: {report['passed_count']}",
        f"- Data Unavailable: {report['failed_data_count']}",
        f"- Data Source: {report['evidence_chain']['data_source']} (confidence: {report['evidence_chain']['confidence']})",
    ])

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Scan SET50 stocks by Return on Equity using yfinance"
    )
    parser.add_argument(
        "--min-roe",
        type=float,
        default=20.0,
        help="Minimum Return on Equity percentage (default: 20.0)",
    )
    parser.add_argument(
        "--symbols",
        type=str,
        help="Comma-separated list of symbols to scan (default: all SET50)",
    )
    parser.add_argument(
        "--output",
        choices=["json", "markdown", "both"],
        default="both",
        help="Output format (default: both)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print progress information",
    )

    args = parser.parse_args()

    symbols = None
    if args.symbols:
        symbols = [s.strip() if s.strip().endswith(".BK") else f"{s.strip()}.BK"
                   for s in args.symbols.split(",")]

    report = scan_set50_roe(
        symbols=symbols,
        min_roe=args.min_roe,
        verbose=args.verbose,
    )

    if args.output in ["markdown", "both"]:
        print(format_markdown_report(report))
        if args.output == "both":
            print("\n---JSON---")

    if args.output in ["json", "both"]:
        print(json.dumps(report, indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
