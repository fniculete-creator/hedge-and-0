/* STUB DATA — Phase 1 development only. Three years, ~12 stocks each,
   figures are approximate from memory and WILL BE REPLACED by the
   tools/build_returns.py pipeline before launch. Do not ship. */
window.MDS_DATA = {
  generated: "stub",
  returnBasis: "adjusted-close (dividends included)",
  sectors: [
    "Communication Services", "Consumer Discretionary", "Consumer Staples",
    "Energy", "Financials", "Health Care", "Industrials",
    "Information Technology", "Materials", "Real Estate", "Utilities"
  ],
  years: {
    "2001": {
      sp500: -11.9,
      stocks: [
        { t: "ENE",  n: "Enron",            s: "Energy",                 dow: 0, r: -99.6, x: 1, note: "Bankrupt December 2001" },
        { t: "MSFT", n: "Microsoft",        s: "Information Technology", dow: 1, r: 52.7 },
        { t: "AAPL", n: "Apple",            s: "Information Technology", dow: 0, r: 47.2 },
        { t: "EBAY", n: "eBay",             s: "Consumer Discretionary", dow: 0, r: 102.9 },
        { t: "IBM",  n: "IBM",              s: "Information Technology", dow: 1, r: 43.0 },
        { t: "GE",   n: "General Electric", s: "Industrials",            dow: 1, r: -15.1 },
        { t: "WMT",  n: "Walmart",          s: "Consumer Staples",       dow: 1, r: 8.9 },
        { t: "INTC", n: "Intel",            s: "Information Technology", dow: 1, r: 4.9 },
        { t: "AMZN", n: "Amazon",           s: "Consumer Discretionary", dow: 0, r: -30.5 },
        { t: "HD",   n: "Home Depot",       s: "Consumer Discretionary", dow: 1, r: 12.1 },
        { t: "KO",   n: "Coca-Cola",        s: "Consumer Staples",       dow: 1, r: -21.4 },
        { t: "XOM",  n: "Exxon Mobil",      s: "Energy",                 dow: 1, r: -7.6 }
      ]
    },
    "2008": {
      sp500: -37.0,
      stocks: [
        { t: "LEH",  n: "Lehman Brothers",  s: "Financials",             dow: 0, r: -99.9, x: 1, note: "Bankrupt September 2008" },
        { t: "AIG",  n: "AIG",              s: "Financials",             dow: 0, r: -97.3, note: "Bailed out September 2008" },
        { t: "WMT",  n: "Walmart",          s: "Consumer Staples",       dow: 1, r: 20.0 },
        { t: "MCD",  n: "McDonald's",       s: "Consumer Discretionary", dow: 1, r: 8.5 },
        { t: "AAPL", n: "Apple",            s: "Information Technology", dow: 0, r: -56.9 },
        { t: "MSFT", n: "Microsoft",        s: "Information Technology", dow: 1, r: -44.4 },
        { t: "GOOG", n: "Google",           s: "Communication Services", dow: 0, r: -55.5 },
        { t: "XOM",  n: "Exxon Mobil",      s: "Energy",                 dow: 1, r: -13.1 },
        { t: "C",    n: "Citigroup",        s: "Financials",             dow: 1, r: -77.2 },
        { t: "JPM",  n: "JPMorgan Chase",   s: "Financials",             dow: 1, r: -25.3 },
        { t: "GE",   n: "General Electric", s: "Industrials",            dow: 1, r: -53.9 },
        { t: "AMZN", n: "Amazon",           s: "Consumer Discretionary", dow: 0, r: -44.6 }
      ]
    },
    "2020": {
      sp500: 18.4,
      stocks: [
        { t: "TSLA", n: "Tesla",            s: "Consumer Discretionary", dow: 0, r: 743.4, note: "Joined the S&P 500 in December 2020" },
        { t: "NVDA", n: "NVIDIA",           s: "Information Technology", dow: 0, r: 122.2 },
        { t: "AAPL", n: "Apple",            s: "Information Technology", dow: 1, r: 82.3 },
        { t: "AMZN", n: "Amazon",           s: "Consumer Discretionary", dow: 0, r: 76.3 },
        { t: "PYPL", n: "PayPal",           s: "Information Technology", dow: 0, r: 116.5 },
        { t: "NFLX", n: "Netflix",          s: "Communication Services", dow: 0, r: 67.1 },
        { t: "MSFT", n: "Microsoft",        s: "Information Technology", dow: 1, r: 42.5 },
        { t: "DIS",  n: "Disney",           s: "Communication Services", dow: 1, r: 25.3 },
        { t: "BA",   n: "Boeing",           s: "Industrials",            dow: 1, r: -33.9 },
        { t: "WFC",  n: "Wells Fargo",      s: "Financials",             dow: 0, r: -41.6 },
        { t: "CCL",  n: "Carnival",         s: "Consumer Discretionary", dow: 0, r: -57.2 },
        { t: "XOM",  n: "Exxon Mobil",      s: "Energy",                 dow: 0, r: -36.2, note: "Dropped from the Dow in August 2020" }
      ]
    }
  }
};
