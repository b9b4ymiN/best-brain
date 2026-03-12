#!/usr/bin/env python3
"""
SET50 Dividend Scanner - ระบบสแกนหุ้น SET50 ที่ปันผลสูงเหมาะกับ VI

Uses yfinance to fetch financial data and filter by dividend yield,
P/E, P/B, and ROE criteria for Value Investors.

Usage:
    python scripts/set50_dividend_scanner.py
    python scripts/set50_dividend_scanner.py --min-yield 4 --output json
    python scripts/set50_dividend_scanner.py --symbols PTT,BDMS,SCB
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

# VI (Value Investor) criteria defaults
VI_CRITERIA = {
    "min_dividend_yield": 3.0,  # ขั้นต่ำ 3% dividend yield
    "max_pe": 15.0,             # P/E ไม่เกิน 15
    "max_pb": 1.5,              # P/B ไม่เกิน 1.5
    "min_roe": 10.0,            # ROE ขั้นต่ำ 10%
    "min_payout": 20.0,         # Payout ratio ขั้นต่ำ 20%
    "max_payout": 90.0,         # Payout ratio ไม่เกิน 90%
}


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

        # Try to get data from financial statements if not in info
        net_income = _to_number(info.get("netIncomeToCommon"))
        total_equity = _to_number(info.get("totalStockholderEquity"))
        total_revenue = _to_number(info.get("totalRevenue"))

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
        if total_revenue is None:
            total_revenue = _first_available_statement_value(
                income_stmt,
                [
                    "Total Revenue",
                    "Revenue",
                    "Operating Revenue",
                ],
            )

        if net_income is not None:
            info["netIncomeToCommon"] = net_income
        if total_equity is not None:
            info["totalStockholderEquity"] = total_equity
        if total_revenue is not None:
            info["totalRevenue"] = total_revenue

        return info
    except Exception as e:
        print(f"Warning: Failed to fetch {symbol}: {e}", file=sys.stderr)
        return None


def calculate_vi_metrics(info: dict[str, Any]) -> dict[str, Any]:
    """Calculate all VI-relevant metrics from ticker info."""
    metrics = {}

    # Dividend Yield - yfinance returns this as percentage (e.g., 6.27 = 6.27%)
    div_yield = _to_number(info.get("dividendYield"))
    # Only multiply by 100 if value is < 1 (decimal form like 0.0627)
    if div_yield is not None and div_yield < 1:
        div_yield = div_yield * 100
    metrics["dividend_yield"] = div_yield

    # Trailing Annual Dividend Rate
    div_rate = _to_number(info.get("trailingAnnualDividendRate"))
    metrics["dividend_rate"] = div_rate

    # P/E Ratio
    pe = _to_number(info.get("trailingPE"))
    metrics["pe_ratio"] = pe

    # Forward P/E
    forward_pe = _to_number(info.get("forwardPE"))
    metrics["forward_pe"] = forward_pe

    # P/B Ratio
    pb = _to_number(info.get("priceToBook"))
    metrics["pb_ratio"] = pb

    # ROE
    net_income = _to_number(info.get("netIncomeToCommon"))
    total_equity = _to_number(info.get("totalStockholderEquity"))
    if net_income is not None and total_equity is not None and total_equity != 0:
        metrics["roe_percent"] = (net_income / total_equity) * 100
    else:
        metrics["roe_percent"] = None

    # NPM (Net Profit Margin)
    total_revenue = _to_number(info.get("totalRevenue"))
    if net_income is not None and total_revenue is not None and total_revenue != 0:
        metrics["npm_percent"] = (net_income / total_revenue) * 100
    else:
        metrics["npm_percent"] = None

    # Payout Ratio - yfinance typically returns this as decimal (0.5 = 50%)
    payout = _to_number(info.get("payoutRatio"))
    if payout is not None and payout <= 1:
        payout = payout * 100  # Convert decimal to percentage
    metrics["payout_ratio"] = payout

    # Current Price
    current_price = _to_number(info.get("currentRegularMarketPrice"))
    if current_price is None:
        current_price = _to_number(info.get("currentPrice"))
    metrics["current_price"] = current_price

    # 52 Week High/Low
    metrics["fifty_two_week_high"] = _to_number(info.get("fiftyTwoWeekHigh"))
    metrics["fifty_two_week_low"] = _to_number(info.get("fiftyTwoWeekLow"))

    # Market Cap
    metrics["market_cap"] = _to_number(info.get("marketCap"))

    return metrics


def check_vi_criteria(metrics: dict[str, Any], criteria: dict[str, float]) -> tuple[bool, list[str]]:
    """
    Check if stock passes VI criteria.

    Returns:
        (passed, reasons) - passed boolean and list of pass/fail reasons
    """
    reasons = []
    all_passed = True

    # Dividend Yield check
    dy = metrics.get("dividend_yield")
    min_dy = criteria["min_dividend_yield"]
    if dy is None:
        reasons.append(f"Dividend Yield: N/A (need >={min_dy}%)")
        all_passed = False
    elif dy >= min_dy:
        reasons.append(f"Dividend Yield: {dy:.2f}% >= {min_dy}%")
    else:
        reasons.append(f"Dividend Yield: {dy:.2f}% < {min_dy}%")
        all_passed = False

    # P/E check
    pe = metrics.get("pe_ratio")
    max_pe = criteria["max_pe"]
    if pe is None:
        reasons.append(f"P/E: N/A (need <={max_pe})")
        all_passed = False
    elif pe <= max_pe:
        reasons.append(f"P/E: {pe:.2f} <= {max_pe}")
    else:
        reasons.append(f"P/E: {pe:.2f} > {max_pe}")
        all_passed = False

    # P/B check
    pb = metrics.get("pb_ratio")
    max_pb = criteria["max_pb"]
    if pb is None:
        reasons.append(f"P/B: N/A (need <={max_pb})")
        all_passed = False
    elif pb <= max_pb:
        reasons.append(f"P/B: {pb:.2f} <= {max_pb}")
    else:
        reasons.append(f"P/B: {pb:.2f} > {max_pb}")
        all_passed = False

    # ROE check
    roe = metrics.get("roe_percent")
    min_roe = criteria["min_roe"]
    if roe is None:
        reasons.append(f"ROE: N/A (need >={min_roe}%)")
        all_passed = False
    elif roe >= min_roe:
        reasons.append(f"ROE: {roe:.2f}% >= {min_roe}%")
    else:
        reasons.append(f"ROE: {roe:.2f}% < {min_roe}%")
        all_passed = False

    # Payout Ratio check (optional - only if data available)
    payout = metrics.get("payout_ratio")
    min_payout = criteria["min_payout"]
    max_payout = criteria["max_payout"]
    if payout is not None:
        if min_payout <= payout <= max_payout:
            reasons.append(f"Payout: {payout:.1f}% (range {min_payout}-{max_payout}%)")
        else:
            reasons.append(f"Payout: {payout:.1f}% (outside range {min_payout}-{max_payout}%)")
            # Don't fail on payout alone - it's secondary criteria

    return all_passed, reasons


def calculate_vi_score(metrics: dict[str, Any], criteria: dict[str, float]) -> int:
    """
    Calculate a VI score (0-100) based on how well the stock meets criteria.

    Higher score = better value investment.
    """
    score = 0

    # Dividend Yield (30 points)
    dy = metrics.get("dividend_yield")
    if dy is not None:
        if dy >= 5:
            score += 30
        elif dy >= 4:
            score += 25
        elif dy >= 3:
            score += 20
        elif dy >= 2:
            score += 10

    # P/E Ratio (25 points - lower is better)
    pe = metrics.get("pe_ratio")
    if pe is not None:
        if pe <= 8:
            score += 25
        elif pe <= 10:
            score += 20
        elif pe <= 12:
            score += 15
        elif pe <= 15:
            score += 10

    # P/B Ratio (20 points - lower is better)
    pb = metrics.get("pb_ratio")
    if pb is not None:
        if pb <= 0.8:
            score += 20
        elif pb <= 1.0:
            score += 15
        elif pb <= 1.2:
            score += 10
        elif pb <= 1.5:
            score += 5

    # ROE (25 points - higher is better)
    roe = metrics.get("roe_percent")
    if roe is not None:
        if roe >= 20:
            score += 25
        elif roe >= 15:
            score += 20
        elif roe >= 12:
            score += 15
        elif roe >= 10:
            score += 10

    return score


def scan_set50_dividend(
    symbols: list[str] | None = None,
    min_yield: float = 3.0,
    max_pe: float = 15.0,
    max_pb: float = 1.5,
    min_roe: float = 10.0,
    verbose: bool = False,
) -> dict[str, Any]:
    """
    Scan SET50 stocks for high dividend stocks suitable for Value Investors.

    Args:
        symbols: List of symbols to scan (default: all SET50)
        min_yield: Minimum dividend yield percentage
        max_pe: Maximum P/E ratio
        max_pb: Maximum P/B ratio
        min_roe: Minimum ROE percentage
        verbose: Print progress information

    Returns:
        Scanner report dictionary
    """
    scan_symbols = symbols if symbols else SET50_SYMBOLS
    generated_at = datetime.now().isoformat()

    criteria = {
        "min_dividend_yield": min_yield,
        "max_pe": max_pe,
        "max_pb": max_pb,
        "min_roe": min_roe,
        "min_payout": VI_CRITERIA["min_payout"],
        "max_payout": VI_CRITERIA["max_payout"],
    }

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

        metrics = calculate_vi_metrics(info)
        passed, reasons = check_vi_criteria(metrics, criteria)
        score = calculate_vi_score(metrics, criteria)

        company_name = info.get("longName", info.get("shortName", symbol))
        sector = info.get("sector", "N/A")
        industry = info.get("industry", "N/A")

        if passed:
            passed_count += 1

        result = {
            "ticker": symbol,
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
            "passed": passed,
            "vi_score": score,
            "metrics": metrics,
            "rationale": "; ".join(reasons),
        }

        results.append(result)

        if verbose:
            status = "PASS" if passed else "FAIL"
            dy_str = f"{metrics['dividend_yield']:.1f}%" if metrics.get("dividend_yield") else "N/A"
            print(f"{status} (Div Yield: {dy_str}, Score: {score})")

    # Sort by VI score descending
    results.sort(key=lambda x: x["vi_score"], reverse=True)

    # Get only passed stocks
    passed_results = [r for r in results if r["passed"]]

    report = {
        "objective": f"Scan SET50 stocks for high dividend stocks suitable for VI (Div Yield >={min_yield}%, P/E <={max_pe}, P/B <={max_pb}, ROE >={min_roe}%)",
        "generated_at": generated_at,
        "market_date": datetime.now().strftime("%Y-%m-%d"),
        "criteria": criteria,
        "results": results,
        "passed_results": passed_results,
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
        f"# SET50 Dividend Scanner Report (VI Style)",
        "",
        f"**Objective:** {report['objective']}",
        f"**Market Date:** {report['market_date']}",
        f"**Generated At:** {report['generated_at']}",
        "",
        "## VI Screening Criteria",
        f"- Minimum Dividend Yield: {report['criteria']['min_dividend_yield']}%",
        f"- Maximum P/E Ratio: {report['criteria']['max_pe']}",
        f"- Maximum P/B Ratio: {report['criteria']['max_pb']}",
        f"- Minimum ROE: {report['criteria']['min_roe']}%",
        "",
        "## Top High Dividend Stocks (Passed All Criteria)",
        "| Rank | Ticker | Company | Div Yield | P/E | P/B | ROE | VI Score |",
        "|------|--------|---------|-----------|-----|-----|-----|----------|",
    ]

    for i, result in enumerate(report["passed_results"][:20], 1):
        m = result["metrics"]
        dy = f"{m['dividend_yield']:.2f}%" if m.get("dividend_yield") else "N/A"
        pe = f"{m['pe_ratio']:.1f}" if m.get("pe_ratio") else "N/A"
        pb = f"{m['pb_ratio']:.2f}" if m.get("pb_ratio") else "N/A"
        roe = f"{m['roe_percent']:.1f}%" if m.get("roe_percent") else "N/A"
        company = result["company_name"][:15] if result["company_name"] else result["ticker"]
        lines.append(
            f"| {i} | {result['ticker']} | {company} | {dy} | {pe} | {pb} | {roe} | {result['vi_score']} |"
        )

    lines.extend([
        "",
        "## All Results Summary",
        f"- Total Scanned: {report['total_scanned']}",
        f"- Passed All Criteria: {report['passed_count']}",
        f"- Data Unavailable: {report['failed_data_count']}",
        f"- Data Source: {report['evidence_chain']['data_source']} (confidence: {report['evidence_chain']['confidence']})",
        "",
        "---",
        "*Generated by SET50 Dividend Scanner for Value Investors*",
    ])

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Scan SET50 stocks for high dividend stocks suitable for Value Investors"
    )
    parser.add_argument(
        "--min-yield",
        type=float,
        default=3.0,
        help="Minimum dividend yield percentage (default: 3.0)",
    )
    parser.add_argument(
        "--max-pe",
        type=float,
        default=15.0,
        help="Maximum P/E ratio (default: 15.0)",
    )
    parser.add_argument(
        "--max-pb",
        type=float,
        default=1.5,
        help="Maximum P/B ratio (default: 1.5)",
    )
    parser.add_argument(
        "--min-roe",
        type=float,
        default=10.0,
        help="Minimum ROE percentage (default: 10.0)",
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

    report = scan_set50_dividend(
        symbols=symbols,
        min_yield=args.min_yield,
        max_pe=args.max_pe,
        max_pb=args.max_pb,
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
