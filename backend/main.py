from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
import yfinance as yf
from datetime import datetime
import logging
import traceback

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Warren Buffett persona prompt
WARREN_BUFFETT_PROMPT = """You are Mr. Warren, an AI assistant embodying the investment philosophy and persona of Warren Buffett. 

Your responses should:
1. Reflect Warren Buffett's long-term value investing philosophy
2. Use his characteristic wisdom, patience, and focus on intrinsic value
3. Speak in a clear, straightforward manner with occasional folksy wisdom
4. Always emphasize the importance of understanding the business fundamentals
5. Focus on long-term value rather than short-term market fluctuations

When analyzing stocks, provide:
- Core business analysis: Explain what the company does and its competitive advantages
- Management quality assessment: Comment on leadership and corporate governance
- Intrinsic value evaluation: Assess the company's true worth based on fundamentals
- Valuation metrics: Analyze P/E, P/B ratios and other key metrics in context
- Investment recommendation: Provide Strong Buy, Hold, or Sell with reasoning
- Price targets: Suggest entry, hold, and exit price ranges based on value investing principles

Remember: "Price is what you pay, value is what you get." Always focus on the business, not the stock price."""

class ChatMessage(BaseModel):
    message: str
    conversation_history: list = []

class IndexData(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float

@app.get("/")
def read_root():
    return {"message": "StockGPT API is running"}

@app.get("/api/indexes")
async def get_indexes():
    """Fetch real-time data and historical data for major stock indexes"""
    indexes = {
        "SENSEX": "^BSESN",  # BSE Sensex
        "NIFTY50": "^NSEI",  # NSE Nifty 50
        "SP500": "^GSPC",    # S&P 500
        "NASDAQ": "^IXIC"    # NASDAQ Composite
    }
    
    index_data = []
    
    for name, symbol in indexes.items():
        try:
            ticker = yf.Ticker(symbol)
            
            # Get 1-day history with 5-minute intervals for chart
            history = ticker.history(period="1d", interval="5m")
            
            # Get 1-month history for longer trend
            monthly_history = ticker.history(period="1mo", interval="1d")
            
            if not history.empty:
                current_price = float(history['Close'].iloc[-1])
                prev_close = float(ticker.info.get('previousClose', current_price))
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                
                # Prepare chart data (last 50 data points)
                chart_data = []
                for idx, row in history.tail(50).iterrows():
                    chart_data.append({
                        "time": idx.strftime("%H:%M") if hasattr(idx, 'strftime') else str(idx),
                        "value": round(float(row['Close']), 2)
                    })
                
                # Prepare monthly chart data
                monthly_chart_data = []
                for idx, row in monthly_history.tail(30).iterrows():
                    monthly_chart_data.append({
                        "date": idx.strftime("%m/%d") if hasattr(idx, 'strftime') else str(idx),
                        "value": round(float(row['Close']), 2)
                    })
                
                index_data.append({
                    "symbol": name,
                    "name": name,
                    "price": round(current_price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "chartData": chart_data,
                    "monthlyChartData": monthly_chart_data
                })
            else:
                # Fallback to info if history is not available
                info_data = ticker.info
                current_price = info_data.get('regularMarketPrice', 0)
                prev_close = info_data.get('previousClose', current_price)
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100 if prev_close != 0 else 0
                
                index_data.append({
                    "symbol": name,
                    "name": name,
                    "price": round(current_price, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "chartData": [],
                    "monthlyChartData": []
                })
        except Exception as e:
            logger.error(f"Error fetching data for {name}: {str(e)}")
            # Return mock data if API fails
            index_data.append({
                "symbol": name,
                "name": name,
                "price": 0.0,
                "change": 0.0,
                "changePercent": 0.0,
                "chartData": [],
                "monthlyChartData": []
            })
    
    return {"indexes": index_data}

@app.post("/api/chat")
async def chat(message_data: ChatMessage):
    """Handle chat messages with Mr. Warren"""
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
        
        logger.info(f"Sending request to OpenAI with model: gpt-5.2")
        
        # Call OpenAI API using GPT-5.2
        response = client.chat.completions.create(
            model="gpt-5.2",
            messages=messages,
            temperature=0.7,
            max_completion_tokens=1500
        )
        
        ai_response = response.choices[0].message.content
        
        return {
            "response": ai_response,
            "timestamp": datetime.now().isoformat()
        }
    
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

