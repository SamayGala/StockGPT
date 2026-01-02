from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
import yfinance as yf
from datetime import datetime, timedelta
import logging
import traceback
import json
import asyncio
import httpx
import time
from functools import lru_cache

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try importing Zerodha Kite Connect
try:
    from kiteconnect import KiteConnect
    KITE_AVAILABLE = True
except ImportError:
    KITE_AVAILABLE = False
    logger.warning("kiteconnect not installed. Install with: pip install kiteconnect")

# Try importing NSE tools
try:
    from nsetools import Nse
    NSE_AVAILABLE = True
except ImportError:
    NSE_AVAILABLE = False
    logger.warning("nsetools not installed. Install with: pip install nsetools")

app = FastAPI(title="StockGPT API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.warning("OPENAI_API_KEY not found in environment variables")
client = OpenAI(api_key=api_key) if api_key else None

# Initialize Zerodha Kite Connect (optional)
kite_api_key = os.getenv("ZERODHA_API_KEY")
kite_api_secret = os.getenv("ZERODHA_API_SECRET")
kite_access_token = os.getenv("ZERODHA_ACCESS_TOKEN")
kite = None

if KITE_AVAILABLE and kite_api_key and kite_api_secret and kite_access_token:
    try:
        kite = KiteConnect(api_key=kite_api_key)
        kite.set_access_token(kite_access_token)
        logger.info("Zerodha Kite Connect initialized successfully")
    except Exception as e:
        logger.warning(f"Failed to initialize Zerodha Kite Connect: {str(e)}")

# Initialize NSE tools (free alternative)
nse = None
if NSE_AVAILABLE:
    try:
        nse = Nse()
        logger.info("NSE tools initialized successfully")
    except Exception as e:
        logger.warning(f"Failed to initialize NSE tools: {str(e)}")

# Warren Buffett persona prompt - Focused on Indian stocks
WARREN_BUFFETT_PROMPT = """You are Mr. Warren, an AI assistant embodying the investment philosophy and persona of Warren Buffett, specializing exclusively in Indian stock market analysis.

Your responses should:
1. Reflect Warren Buffett's long-term value investing philosophy applied to Indian markets
2. Use his characteristic wisdom, patience, and focus on intrinsic value
3. Speak in a clear, straightforward manner with occasional folksy wisdom
4. Always emphasize the importance of understanding the business fundamentals
5. Focus on long-term value rather than short-term market fluctuations
6. Consider Indian market context: regulatory environment, economic growth, currency factors, and market dynamics

IMPORTANT: You ONLY analyze and provide advice about INDIAN STOCKS listed on NSE (National Stock Exchange) or BSE (Bombay Stock Exchange). If asked about US stocks or international stocks, politely redirect to Indian stocks.

When analyzing Indian stocks, provide:
- Core business analysis: Explain what the company does and its competitive advantages in the Indian market
- Management quality assessment: Comment on leadership, corporate governance, and promoter holding
- Intrinsic value evaluation: Assess the company's true worth based on fundamentals (consider Indian market valuations)
- Valuation metrics: Analyze P/E, P/B ratios, ROCE, ROE in context of Indian market standards
- Investment recommendation: Provide Strong Buy, Hold, or Sell with reasoning specific to Indian market conditions
- Price targets: Suggest entry, hold, and exit price ranges in INR based on value investing principles
- Market context: Consider factors like FII/DII holdings, promoter stake, sector trends in India

Remember: "Price is what you pay, value is what you get." Always focus on the business, not the stock price. Focus exclusively on Indian companies and markets."""

class ChatMessage(BaseModel):
    message: str
    conversation_history: list = []

class IndexData(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float

class StockData(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float
    volume: int = 0
    marketCap: float = 0
    pe: float = 0
    pb: float = 0
    dividendYield: float = 0
    roce: float = 0
    roe: float = 0
    bookValue: float = 0
    high52w: float = 0
    low52w: float = 0

@app.get("/")
def read_root():
    return {"message": "StockGPT API is running"}

# Cache for storing last fetched data to avoid rate limits
index_data_cache = {}
cache_ttl = 30  # Cache for 30 seconds

def get_stock_index_data(symbol: str, period: str = "5d", interval: str = "1h"):
    """Function to fetch stock index data - can be called by ChatGPT with rate limiting and caching"""
    try:
        # Check cache first
        cache_key = f"{symbol}_{period}_{interval}"
        if cache_key in index_data_cache:
            cached_data, cached_time = index_data_cache[cache_key]
            if time.time() - cached_time < cache_ttl:
                logger.info(f"Returning cached data for {symbol}")
                return cached_data
        
        index_symbols = {
            "SENSEX": "^BSESN",  # BSE Sensex
            "NIFTY50": "^NSEI",  # NSE Nifty 50
        }
        
        # Normalize symbol
        symbol_upper = symbol.upper()
        if symbol_upper in index_symbols:
            ticker_symbol = index_symbols[symbol_upper]
        else:
            ticker_symbol = symbol
        
        # Add delay to avoid rate limiting
        time.sleep(0.5)
        
        ticker = yf.Ticker(ticker_symbol)
        
        # Try to get history with retries
        history = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                for intv in [interval, "1h", "1d"]:
                    try:
                        history = ticker.history(period=period, interval=intv, timeout=10)
                        if not history.empty:
                            break
                    except Exception as e:
                        logger.warning(f"Failed to get history with interval {intv} for {symbol}: {str(e)}")
                        continue
                
                if history is not None and not history.empty:
                    break
                    
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed for {symbol}: {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(1)  # Wait before retry
                continue
        
        if history is None or history.empty:
            # Fallback to info with retries
            info = None
            for attempt in range(max_retries):
                try:
                    info = ticker.info
                    if info:
                        break
                except Exception as e:
                    if "429" in str(e) or "Too Many Requests" in str(e):
                        logger.warning(f"Rate limited for {symbol}, waiting...")
                        time.sleep(2 * (attempt + 1))  # Exponential backoff
                    else:
                        logger.warning(f"Error fetching info for {symbol} (attempt {attempt + 1}): {str(e)}")
                        if attempt < max_retries - 1:
                            time.sleep(1)
            
            if info:
                try:
                    current_price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose', 0)
                    prev_close = info.get('previousClose', current_price)
                    
                    if current_price and current_price > 0:
                        result = {
                            "symbol": symbol_upper,
                            "current_price": round(current_price, 2),
                            "previous_close": round(prev_close, 2),
                            "change": round(current_price - prev_close, 2),
                            "change_percent": round(((current_price - prev_close) / prev_close * 100) if prev_close != 0 else 0, 2),
                            "chart_data": [],
                            "status": "limited_data"
                        }
                        # Cache the result
                        index_data_cache[cache_key] = (result, time.time())
                        return result
                except Exception as e:
                    logger.error(f"Error processing info for {symbol}: {str(e)}")
            
            # Return mock data if all fails
            logger.warning(f"Could not fetch data for {symbol}, returning mock data")
            mock_price = {
                "SENSEX": 75000,
                "NIFTY50": 24000,
            }.get(symbol_upper, 50000)
            
            result = {
                "symbol": symbol_upper,
                "current_price": mock_price,
                "previous_close": mock_price * 0.99,
                "change": mock_price * 0.01,
                "change_percent": 1.0,
                "chart_data": [],
                "status": "mock_data"
            }
            index_data_cache[cache_key] = (result, time.time())
            return result
        
        # Process history data
        try:
            current_price = float(history['Close'].iloc[-1])
            prev_close = float(history['Close'].iloc[0]) if len(history) > 1 else current_price
            
            # Get chart data
            chart_data = []
            chart_history = history.tail(50) if len(history) > 50 else history
            for idx, row in chart_history.iterrows():
                try:
                    if hasattr(idx, 'strftime'):
                        if interval in ["5m", "15m", "1h"]:
                            time_str = idx.strftime("%H:%M")
                        else:
                            time_str = idx.strftime("%m/%d")
                    else:
                        time_str = str(idx)
                except:
                    time_str = str(idx)
                
                chart_data.append({
                    "time": time_str,
                    "value": round(float(row['Close']), 2)
                })
            
            result = {
                "symbol": symbol_upper,
                "current_price": round(current_price, 2),
                "previous_close": round(prev_close, 2),
                "change": round(current_price - prev_close, 2),
                "change_percent": round(((current_price - prev_close) / prev_close * 100) if prev_close != 0 else 0, 2),
                "chart_data": chart_data,
                "data_points": len(chart_data),
                "status": "success"
            }
            
            # Cache the result
            index_data_cache[cache_key] = (result, time.time())
            return result
            
        except Exception as e:
            logger.error(f"Error processing history data for {symbol}: {str(e)}")
            raise
        
    except Exception as e:
        logger.error(f"Error in get_stock_index_data for {symbol}: {str(e)}\n{traceback.format_exc()}")
        # Return mock data on error
        mock_price = {
            "SENSEX": 75000,
            "NIFTY50": 24000,
        }.get(symbol.upper(), 50000)
        
        return {
            "symbol": symbol.upper(),
            "current_price": mock_price,
            "previous_close": mock_price * 0.99,
            "change": mock_price * 0.01,
            "change_percent": 1.0,
            "chart_data": [],
            "status": "error_fallback"
        }

def get_index_price_nse(index_name: str):
    """Get index price using NSE tools"""
    if not nse:
        return None
    try:
        if index_name == "NIFTY50":
            quote = nse.get_index_quote("NIFTY 50")
        elif index_name == "SENSEX":
            # NSE tools doesn't have Sensex, need to use BSE or yfinance
            return None
        else:
            return None
        
        if quote:
            current_price = quote.get('lastPrice', 0)
            prev_close = quote.get('previousClose', current_price)
            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close != 0 else 0
            return {
                "price": round(current_price, 2),
                "change": round(change, 2),
                "changePercent": round(change_percent, 2)
            }
    except Exception as e:
        logger.warning(f"NSE index error for {index_name}: {str(e)}")
    return None

def get_index_data_from_zerodha(index_name: str):
    """Get index data from Zerodha Kite Connect with 1 year historical data"""
    if not kite:
        return None
    
    try:
        # Known Zerodha instrument tokens for indexes
        index_tokens = {
            "SENSEX": 265,  # BSE Sensex
            "NIFTY50": 256265,  # NSE Nifty 50
        }
        
        # Known Zerodha symbols for indexes
        index_symbols = {
            "SENSEX": "BSE|SENSEX",
            "NIFTY50": "NSE|Nifty 50",
        }
        
        instrument_token = index_tokens.get(index_name)
        kite_symbol = index_symbols.get(index_name)
        
        if not instrument_token or not kite_symbol:
            logger.warning(f"Unknown index: {index_name}")
            return None
        
        # Get current price from historical data (quotes may not work for indexes)
        from datetime import datetime, timedelta
        current_price = 0
        prev_close = 0
        
        try:
            # Get recent data (last 5 days) to get current and previous close
            end_date = datetime.now()
            start_date = end_date - timedelta(days=5)
            
            historical = kite.historical_data(
                instrument_token=instrument_token,
                from_date=start_date,
                to_date=end_date,
                interval='day'
            )
            
            if historical and len(historical) > 0:
                # Most recent day's close is current price
                current_price = historical[-1].get('close', 0)
                # Previous day's close
                if len(historical) > 1:
                    prev_close = historical[-2].get('close', current_price)
                else:
                    prev_close = current_price
            else:
                logger.warning(f"No historical data returned for {index_name}")
                return None
                
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Error getting price from historical data for {index_name}: {error_msg}")
            # Try quote as fallback
            try:
                quote = kite.quote([kite_symbol])
                if quote and kite_symbol in quote:
                    quote_data = quote[kite_symbol]
                    current_price = quote_data.get('last_price', 0)
                    ohlc = quote_data.get('ohlc', {})
                    prev_close = ohlc.get('close', current_price) if ohlc else current_price
            except Exception as e2:
                logger.warning(f"Quote also failed for {index_name}: {str(e2)}")
                return None
        
        if current_price == 0:
            logger.warning(f"Could not get current price for {index_name}")
            return None
        
        change = current_price - prev_close
        change_percent = (change / prev_close * 100) if prev_close != 0 else 0
        
        # Get 1 year historical data
        chart_data = []
        try:
            from datetime import datetime, timedelta
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365)
            
            # Get historical data using the known instrument token
            historical = kite.historical_data(
                instrument_token=instrument_token,
                from_date=start_date,
                to_date=end_date,
                interval='day'
            )
            
            if historical:
                for candle in historical:
                    chart_data.append({
                        "date": candle['date'].strftime("%Y-%m-%d") if hasattr(candle['date'], 'strftime') else str(candle['date']),
                        "value": round(float(candle['close']), 2),
                        "open": round(float(candle['open']), 2),
                        "high": round(float(candle['high']), 2),
                        "low": round(float(candle['low']), 2),
                        "volume": int(candle.get('volume', 0))
                    })
        except Exception as e:
            logger.warning(f"Error fetching historical data for {index_name}: {str(e)}")
        
        return {
            "price": round(current_price, 2),
            "change": round(change, 2),
            "changePercent": round(change_percent, 2),
            "chartData": chart_data
        }
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        logger.error(f"Zerodha index error for {index_name}: {error_msg}\n{error_trace}")
    return None

@app.get("/api/indexes")
async def get_indexes():
    """Fetch real-time data for Indian stock indexes using Zerodha API only"""
    if not kite:
        raise HTTPException(status_code=400, detail="Zerodha Kite Connect not configured. Please add API credentials to .env file")
    indexes = ["SENSEX", "NIFTY50"]
    index_data = []
    
    for i, name in enumerate(indexes):
        try:
            # Add delay between requests
            if i > 0:
                await asyncio.sleep(0.5)
            
            # Get data from Zerodha only
            price_data = get_index_data_from_zerodha(name)
            
            if price_data and price_data.get("price", 0) > 0:
                chart_data = price_data.get("chartData", [])
                index_data.append({
                    "symbol": name,
                    "name": name,
                    "price": price_data["price"],
                    "change": price_data["change"],
                    "changePercent": price_data["changePercent"],
                    "chartData": chart_data,
                    "monthlyChartData": []
                })
            else:
                logger.warning(f"Failed to fetch {name} from Zerodha")
                index_data.append({
                    "symbol": name,
                    "name": name,
                    "price": 0,
                    "change": 0,
                    "changePercent": 0,
                    "chartData": [],
                    "monthlyChartData": []
                })
        except Exception as e:
            logger.error(f"Exception fetching {name}: {str(e)}")
            # Use fallback data
            mock_price = {
                "SENSEX": 75000,
                "NIFTY50": 24000,
            }.get(name, 50000)
            
            index_data.append({
                "symbol": name,
                "name": name,
                "price": mock_price,
                "change": mock_price * 0.01,
                "changePercent": 1.0,
                "chartData": [],
                "monthlyChartData": []
            })
    
    return {"indexes": index_data}

def get_stock_price_nse(symbol: str):
    """Get stock price using NSE tools (free)"""
    if not nse:
        return None
    try:
        # Remove .NS suffix if present
        clean_symbol = symbol.replace('.NS', '').replace('.BO', '')
        quote = nse.get_quote(clean_symbol)
        if quote:
            current_price = quote.get('lastPrice', 0)
            prev_close = quote.get('previousClose', current_price)
            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close != 0 else 0
            return {
                "price": round(current_price, 2),
                "change": round(change, 2),
                "changePercent": round(change_percent, 2)
            }
    except Exception as e:
        logger.warning(f"NSE tools error for {symbol}: {str(e)}")
    return None

def get_stock_price_kite(symbol: str):
    """Get stock price using Zerodha Kite Connect"""
    if not kite:
        return None
    try:
        # Convert to Kite format (NSE:SYMBOL)
        clean_symbol = symbol.replace('.NS', '').replace('.BO', '')
        kite_symbol = f"NSE:{clean_symbol}"
        quote = kite.quote(kite_symbol)
        if quote and kite_symbol in quote:
            data = quote[kite_symbol]
            current_price = data.get('last_price', 0)
            prev_close = data.get('ohlc', {}).get('close', current_price)
            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close != 0 else 0
            return {
                "price": round(current_price, 2),
                "change": round(change, 2),
                "changePercent": round(change_percent, 2)
            }
    except Exception as e:
        logger.warning(f"Kite Connect error for {symbol}: {str(e)}")
    return None

def get_popular_stocks():
    """Get list of popular Indian stocks for ticker tape"""
    # Popular Indian stocks from NSE
    return [
        {"symbol": "RELIANCE.NS", "name": "RELIANCE"},
        {"symbol": "TCS.NS", "name": "TCS"},
        {"symbol": "HDFCBANK.NS", "name": "HDFC BANK"},
        {"symbol": "INFY.NS", "name": "INFY"},
        {"symbol": "ICICIBANK.NS", "name": "ICICI BANK"},
        {"symbol": "HINDUNILVR.NS", "name": "HUL"},
        {"symbol": "ITC.NS", "name": "ITC"},
        {"symbol": "SBIN.NS", "name": "SBI"},
        {"symbol": "BHARTIARTL.NS", "name": "BHARTI"},
        {"symbol": "KOTAKBANK.NS", "name": "KOTAK BANK"},
        {"symbol": "LT.NS", "name": "L&T"},
        {"symbol": "AXISBANK.NS", "name": "AXIS BANK"},
        {"symbol": "ASIANPAINT.NS", "name": "ASIAN PAINT"},
        {"symbol": "MARUTI.NS", "name": "MARUTI"},
        {"symbol": "NESTLEIND.NS", "name": "NESTLE"},
        {"symbol": "ULTRACEMCO.NS", "name": "ULTRATECH"},
        {"symbol": "WIPRO.NS", "name": "WIPRO"},
        {"symbol": "SUNPHARMA.NS", "name": "SUN PHARMA"},
        {"symbol": "ONGC.NS", "name": "ONGC"},
        {"symbol": "POWERGRID.NS", "name": "POWERGRID"},
        {"symbol": "NTPC.NS", "name": "NTPC"},
        {"symbol": "TITAN.NS", "name": "TITAN"},
        {"symbol": "BAJFINANCE.NS", "name": "BAJAJ FIN"},
        {"symbol": "HCLTECH.NS", "name": "HCL TECH"},
        {"symbol": "TECHM.NS", "name": "TECH MAHINDRA"},
    ]

@app.get("/api/stocks/ticker")
async def get_ticker_stocks():
    """Get popular stocks for ticker tape using Zerodha API only"""
    if not kite:
        return {"stocks": []}  # Return empty if Zerodha not configured
    
    stocks = get_popular_stocks()
    stock_data = []
    
    try:
        # Get all symbols in Kite format
        kite_symbols = [f"NSE:{s['symbol'].replace('.NS', '')}" for s in stocks]
        quotes = kite.quote(kite_symbols)
        
        for stock in stocks:
            try:
                clean_symbol = stock["symbol"].replace('.NS', '')
                kite_symbol = f"NSE:{clean_symbol}"
                
                if kite_symbol in quotes:
                    data = quotes[kite_symbol]
                    current_price = data.get('last_price', 0)
                    prev_close = data.get('ohlc', {}).get('close', current_price)
                    
                    if current_price and current_price > 0:
                        change = current_price - prev_close
                        change_percent = (change / prev_close * 100) if prev_close != 0 else 0
                        
                        stock_data.append({
                            "symbol": stock["symbol"],
                            "name": stock["name"],
                            "price": round(current_price, 2),
                            "change": round(change, 2),
                            "changePercent": round(change_percent, 2)
                        })
            except Exception as e:
                logger.warning(f"Error processing {stock['symbol']} from Zerodha: {str(e)}")
                continue
        
        return {"stocks": stock_data}
    except Exception as e:
        logger.error(f"Error fetching ticker stocks from Zerodha: {str(e)}")
        return {"stocks": []}

@app.get("/api/zerodha/holdings")
async def get_zerodha_holdings():
    """Get all holdings from Zerodha account"""
    if not kite:
        raise HTTPException(status_code=400, detail="Zerodha Kite Connect not configured. Please add API credentials to .env file")
    
    try:
        holdings = kite.holdings()
        
        # Get all symbols for batch quote
        kite_symbols = []
        for holding in holdings:
            symbol = holding.get('tradingsymbol', '')
            exchange = holding.get('exchange', 'NSE')
            kite_symbol = f"{exchange}:{symbol}"
            kite_symbols.append(kite_symbol)
        
        # Get quotes in batch (more efficient)
        quotes = {}
        if kite_symbols:
            try:
                quotes = kite.quote(kite_symbols)
            except Exception as e:
                logger.warning(f"Error getting batch quotes: {str(e)}")
        
        # Process holdings data
        holdings_data = []
        for holding in holdings:
            try:
                symbol = holding.get('tradingsymbol', '')
                exchange = holding.get('exchange', 'NSE')
                kite_symbol = f"{exchange}:{symbol}"
                
                # Get current quote from batch
                current_price = holding.get('average_price', 0)
                prev_close = current_price
                
                if kite_symbol in quotes:
                    quote_data = quotes[kite_symbol]
                    current_price = quote_data.get('last_price', holding.get('average_price', 0))
                    ohlc = quote_data.get('ohlc', {})
                    prev_close = ohlc.get('close', current_price) if ohlc else current_price
                else:
                    # Fallback: try individual quote
                    try:
                        quote = kite.quote([kite_symbol])
                        if quote and kite_symbol in quote:
                            quote_data = quote[kite_symbol]
                            current_price = quote_data.get('last_price', holding.get('average_price', 0))
                            ohlc = quote_data.get('ohlc', {})
                            prev_close = ohlc.get('close', current_price) if ohlc else current_price
                    except:
                        pass
                
                quantity = holding.get('quantity', 0)
                average_price = holding.get('average_price', 0)
                
                # Calculate values
                invested_value = average_price * quantity
                total_value = current_price * quantity
                
                # Calculate P&L (can use Zerodha's pnl or calculate our own)
                pnl_from_zerodha = holding.get('pnl', 0)
                calculated_pnl = total_value - invested_value
                
                # Use calculated P&L if Zerodha's is 0 or seems incorrect, otherwise use Zerodha's
                pnl = calculated_pnl if abs(pnl_from_zerodha) < 0.01 else pnl_from_zerodha
                
                # Calculate P&L percentage correctly
                pnl_percent = (pnl / invested_value * 100) if invested_value > 0 else 0
                
                holdings_data.append({
                    "symbol": symbol,
                    "exchange": exchange,
                    "name": holding.get('tradingsymbol', symbol),
                    "quantity": quantity,
                    "averagePrice": round(average_price, 2),
                    "currentPrice": round(current_price, 2),
                    "prevClose": round(prev_close, 2),
                    "change": round(current_price - prev_close, 2),
                    "changePercent": round(((current_price - prev_close) / prev_close * 100) if prev_close != 0 else 0, 2),
                    "pnl": round(pnl, 2),
                    "pnlPercent": round(pnl_percent, 2),
                    "totalValue": round(total_value, 2),
                    "investedValue": round(invested_value, 2)
                })
            except Exception as e:
                logger.warning(f"Error processing holding {holding.get('tradingsymbol', 'unknown')}: {str(e)}")
                continue
        
        return {
            "success": True,
            "holdings": holdings_data,
            "totalHoldings": len(holdings_data),
            "totalValue": sum(h.get('totalValue', 0) for h in holdings_data),
            "totalInvested": sum(h.get('investedValue', 0) for h in holdings_data),
            "totalPnl": sum(h.get('pnl', 0) for h in holdings_data)
        }
    except Exception as e:
        logger.error(f"Error fetching Zerodha holdings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching holdings: {str(e)}")

@app.get("/api/zerodha/watchlist")
async def get_zerodha_watchlist():
    """Get watchlist from Zerodha account"""
    if not kite:
        raise HTTPException(status_code=400, detail="Zerodha Kite Connect not configured. Please add API credentials to .env file")
    
    try:
        # Get all watchlists - try different method names
        watchlists = []
        try:
            # Try the correct method name
            if hasattr(kite, 'watchlists'):
                watchlists = kite.watchlists()
            elif hasattr(kite, 'get_watchlists'):
                watchlists = kite.get_watchlists()
            else:
                # If method doesn't exist, return empty watchlist
                logger.warning("Watchlist method not available in KiteConnect")
                return {
                    "success": True,
                    "watchlist": [],
                    "totalStocks": 0
                }
        except Exception as e:
            logger.warning(f"Error getting watchlists: {str(e)}")
            return {
                "success": True,
                "watchlist": [],
                "totalStocks": 0
            }
        
        # Get stocks from default watchlist (first one or named "Default")
        watchlist_data = []
        default_watchlist = None
        
        for wl in watchlists:
            if wl.get('name') == 'Default' or not default_watchlist:
                default_watchlist = wl
                break
        
        if not default_watchlist and watchlists:
            default_watchlist = watchlists[0]
        
        if default_watchlist:
            watchlist_id = default_watchlist.get('id')
            stocks = kite.watchlist(watchlist_id)
            
            # Get quotes for all stocks in watchlist
            if stocks:
                symbols = [f"{s.get('exchange', 'NSE')}:{s.get('tradingsymbol', '')}" for s in stocks if s.get('tradingsymbol')]
                if symbols:
                    quotes = kite.quote(symbols)
                    
                    for stock in stocks:
                        try:
                            symbol = stock.get('tradingsymbol', '')
                            exchange = stock.get('exchange', 'NSE')
                            kite_symbol = f"{exchange}:{symbol}"
                            
                            if kite_symbol in quotes:
                                quote_data = quotes[kite_symbol]
                                current_price = quote_data.get('last_price', 0)
                                prev_close = quote_data.get('ohlc', {}).get('close', current_price)
                                change = current_price - prev_close
                                change_percent = (change / prev_close * 100) if prev_close != 0 else 0
                                
                                watchlist_data.append({
                                    "symbol": symbol,
                                    "exchange": exchange,
                                    "name": symbol,
                                    "price": round(current_price, 2),
                                    "change": round(change, 2),
                                    "changePercent": round(change_percent, 2),
                                    "prevClose": round(prev_close, 2)
                                })
                        except Exception as e:
                            logger.warning(f"Error processing watchlist stock {stock.get('tradingsymbol', 'unknown')}: {str(e)}")
                            continue
        
        return {
            "success": True,
            "watchlist": watchlist_data,
            "totalStocks": len(watchlist_data)
        }
    except Exception as e:
        logger.error(f"Error fetching Zerodha watchlist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching watchlist: {str(e)}")

@app.get("/api/zerodha/portfolio")
async def get_zerodha_portfolio():
    """Get complete portfolio summary from Zerodha"""
    if not kite:
        raise HTTPException(status_code=400, detail="Zerodha Kite Connect not configured")
    
    try:
        # Get portfolio positions
        positions = kite.positions()
        
        # Get holdings
        holdings = kite.holdings()
        
        # Calculate totals
        day_positions = positions.get('day', [])
        net_positions = positions.get('net', [])
        
        total_day_pnl = sum(p.get('pnl', 0) for p in day_positions)
        total_net_pnl = sum(p.get('pnl', 0) for p in net_positions)
        
        # Calculate totals from holdings
        total_value = 0
        total_invested = 0
        total_pnl = 0
        
        for holding in holdings:
            quantity = holding.get('quantity', 0)
            average_price = holding.get('average_price', 0)
            invested_value = average_price * quantity
            
            # Try to get current price
            symbol = holding.get('tradingsymbol', '')
            exchange = holding.get('exchange', 'NSE')
            kite_symbol = f"{exchange}:{symbol}"
            
            try:
                quote = kite.quote([kite_symbol])
                if quote and kite_symbol in quote:
                    current_price = quote[kite_symbol].get('last_price', average_price)
                else:
                    current_price = average_price
            except:
                current_price = average_price
            
            total_value += current_price * quantity
            total_invested += invested_value
            total_pnl += (current_price * quantity) - invested_value
        
        return {
            "success": True,
            "dayPositions": len(day_positions),
            "netPositions": len(net_positions),
            "holdings": len(holdings),
            "dayPnl": round(total_day_pnl, 2),
            "netPnl": round(total_net_pnl, 2),
            "totalValue": round(total_value, 2),
            "totalInvested": round(total_invested, 2),
            "totalPnl": round(total_pnl, 2)
        }
    except Exception as e:
        logger.error(f"Error fetching Zerodha portfolio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching portfolio: {str(e)}")

@app.get("/api/stocks/{symbol}")
async def get_stock_details(symbol: str):
    """Get detailed Indian stock information using Zerodha API only"""
    if not kite:
        raise HTTPException(status_code=400, detail="Zerodha Kite Connect not configured. Please add API credentials to .env file")
    
    try:
        # Clean symbol - remove .NS/.BO if present
        clean_symbol = symbol.replace('.NS', '').replace('.BO', '')
        kite_symbol = f"NSE:{clean_symbol}"
        
        # Get quote from Zerodha
        quote = kite.quote([kite_symbol])
        if not quote or kite_symbol not in quote:
            raise HTTPException(status_code=404, detail=f"Stock {symbol} not found in Zerodha. Please check the symbol.")
        
        quote_data = quote[kite_symbol]
        current_price = quote_data.get('last_price', 0)
        prev_close = quote_data.get('ohlc', {}).get('close', current_price)
        change = current_price - prev_close
        change_percent = (change / prev_close * 100) if prev_close != 0 else 0
        
        # Get 1 year historical data
        from datetime import datetime, timedelta
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        
        chart_data = []
        instrument_token = quote_data.get('instrument_token')
        if instrument_token:
            try:
                historical = kite.historical_data(
                    instrument_token=instrument_token,
                    from_date=start_date,
                    to_date=end_date,
                    interval='day'
                )
                if historical:
                    for candle in historical:
                        chart_data.append({
                            "date": candle['date'].strftime("%Y-%m-%d") if hasattr(candle['date'], 'strftime') else str(candle['date']),
                            "price": round(float(candle['close']), 2),
                            "volume": int(candle.get('volume', 0))
                        })
            except Exception as e:
                logger.warning(f"Error fetching historical data for {symbol}: {str(e)}")
        
        # Get instrument details for additional info
        instruments = kite.instruments()
        instrument_info = None
        for inst in instruments:
            if inst.get('tradingsymbol') == clean_symbol and inst.get('exchange') == 'NSE':
                instrument_info = inst
                break
        
        # Extract basic info from quote and instrument
        company_name = instrument_info.get('name', clean_symbol) if instrument_info else clean_symbol
        sector = "N/A"  # Zerodha doesn't provide sector directly
        industry = "N/A"  # Zerodha doesn't provide industry directly
        description = ""  # Would need to fetch from other sources
        
        # Get OHLC data for 52W high/low
        ohlc = quote_data.get('ohlc', {})
        high_52w = quote_data.get('upper_circuit_limit', ohlc.get('high', current_price))
        low_52w = quote_data.get('lower_circuit_limit', ohlc.get('low', current_price))
        
        # Calculate market cap from quote (if available)
        market_cap = quote_data.get('market_cap', 0) or 0
        
        # Get volume
        volume = quote_data.get('volume', 0)
        avg_volume = quote_data.get('average_volume', volume)
        
        # Financial metrics - Zerodha doesn't provide all of these directly
        # These would need to be fetched from other sources or calculated
        pe_ratio = 0  # Not directly available from Zerodha quote
        pb_ratio = 0  # Not directly available from Zerodha quote
        dividend_yield = 0  # Not directly available from Zerodha quote
        book_value = 0  # Not directly available from Zerodha quote
        roe = 0  # Not directly available from Zerodha quote
        roce = 0  # Not directly available from Zerodha quote
        
        # Quarterly data - not available from Zerodha quote API
        quarterly_data = []
        
        return {
            "symbol": f"{clean_symbol}.NS",
            "name": company_name,
            "sector": sector,
            "industry": industry,
            "description": description,
            "price": round(current_price, 2),
            "change": round(change, 2),
            "changePercent": round(change_percent, 2),
            "previousClose": round(prev_close, 2),
            "marketCap": market_cap,
            "pe": pe_ratio,
            "pb": pb_ratio,
            "dividendYield": dividend_yield,
            "bookValue": book_value,
            "roe": roe,
            "roce": roce,
            "high52w": round(high_52w, 2),
            "low52w": round(low_52w, 2),
            "volume": volume,
            "avgVolume": avg_volume,
            "chartData": chart_data,
            "quarterlyData": quarterly_data,
            "pros": [],  # Will be generated by AI
            "cons": []   # Will be generated by AI
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stock details for {symbol}: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error fetching stock data: {str(e)}")

async def generate_stream(messages):
    """Generator function for streaming responses"""
    try:
        stream = client.chat.completions.create(
            model="gpt-5.2",
            messages=messages,
            temperature=0.7,
            max_completion_tokens=1500,
            stream=True
        )
        
        for chunk in stream:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if hasattr(delta, 'content') and delta.content is not None:
                    content = delta.content
                    yield f"data: {json.dumps({'content': content})}\n\n"
        
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        logger.error(f"Streaming error: {error_msg}\n{error_trace}")
        yield f"data: {json.dumps({'error': error_msg})}\n\n"

@app.post("/api/chat")
async def chat(message_data: ChatMessage):
    """Handle chat messages with Mr. Warren - streaming response"""
    try:
        if client is None:
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file"
            )
        
        # Build conversation history
        messages = [
            {"role": "system", "content": WARREN_BUFFETT_PROMPT}
        ]
        
        # Add conversation history
        for msg in message_data.conversation_history[-10:]:  # Keep last 10 messages
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })
        
        # Add current message
        messages.append({
            "role": "user",
            "content": message_data.message
        })
        
        logger.info(f"Sending streaming request to OpenAI with model: gpt-5.2")
        
        # Return streaming response
        return StreamingResponse(
            generate_stream(messages),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST",
                "Access-Control-Allow-Headers": "*"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        error_trace = traceback.format_exc()
        logger.error(f"Error processing chat: {error_msg}\n{error_trace}")
        
        # Provide more helpful error messages
        if "model" in error_msg.lower() and ("not found" in error_msg.lower() or "invalid" in error_msg.lower()):
            raise HTTPException(
                status_code=500, 
                detail=f"Model 'gpt-5.2' may not be available. Error: {error_msg}"
            )
        elif "api key" in error_msg.lower() or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail="OpenAI API authentication failed. Please check your API key."
            )
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"Error processing chat: {error_msg}"
            )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

