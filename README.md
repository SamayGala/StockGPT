# StockGPT - Mr. Warren's Investment Advisor

A modern, AI-powered stock analysis platform featuring Mr. Warren, an AI assistant that provides investment advice in the persona of Warren Buffett. Get comprehensive stock analysis focusing on value investing principles, business fundamentals, and intrinsic value.

## Features

- 🤖 **Mr. Warren AI Assistant**: Get investment advice in Warren Buffett's style, specializing in Indian stock markets
- 📊 **Real-time Market Indexes**: View live data for Sensex and Nifty50
- 📈 **Ticker Tape**: Continuous scrolling ticker showing popular Indian stocks
- 💬 **Interactive Chat Interface**: Ask questions about Indian stocks listed on NSE/BSE
- 📋 **Watchlist**: Save and track your favorite Indian stocks
- 📊 **Stock Detail View**: Comprehensive stock analysis similar to screener.in with:
  - Key metrics (Market Cap, P/E, P/B, ROCE, ROE, Dividend Yield)
  - Interactive price charts
  - Company information and business description
  - Pros and Cons analysis
- 📈 **Comprehensive Analysis**: Get insights on:
  - Core business analysis specific to Indian market
  - Management quality assessment (promoter holding, governance)
  - Intrinsic value evaluation with Indian market context
  - P/E, P/B ratio analysis in context of Indian valuations
  - Strong Buy/Hold/Sell recommendations
  - Price targets in INR based on value investing

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: React + Vite
- **AI Model**: OpenAI GPT-4 Turbo (latest model)
- **Stock Data**: Yahoo Finance API (yfinance)

## Prerequisites

- Python 3.8+
- Node.js 16+
- OpenAI API Key ([Get one here](https://platform.openai.com/api-keys))

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory:
```bash
cp env.example .env
```

5. Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=your_actual_api_key_here
```

6. Run the backend server:
```bash
python main.py
```

The backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## Usage

1. Open your browser and navigate to `http://localhost:5173`
2. View the real-time market indexes (Sensex, Nifty50) on the dashboard
3. Watch the ticker tape showing popular Indian stocks - click any stock to view details
4. Start chatting with Mr. Warren by asking questions about Indian stocks:
   - "Analyze Reliance Industries"
   - "What do you think about TCS stock?"
   - "Should I buy HDFC Bank at current prices?"
   - "Compare ICICI Bank and Axis Bank"
   - "Analyze HDFCAMC stock"
5. Add stocks to your watchlist from the stock detail view
6. View detailed stock information by clicking on any stock in the ticker tape

## Project Structure

```
StockGPT/
├── backend/
│   ├── main.py              # FastAPI backend server
│   ├── requirements.txt     # Python dependencies
│   ├── env.example          # Environment variables template
│   └── .env                 # Your API keys (not in git)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React component
│   │   ├── App.css          # Styling
│   │   ├── main.jsx         # React entry point
│   │   └── index.css        # Global styles
│   ├── index.html           # HTML template
│   ├── package.json         # Node dependencies
│   └── vite.config.js       # Vite configuration
└── README.md
```

## API Endpoints

### `GET /api/indexes`
Returns real-time data for Indian stock indexes (Sensex, Nifty50)

### `GET /api/stocks/ticker`
Returns popular Indian stocks for the ticker tape

### `GET /api/stocks/{symbol}`
Get detailed information for an Indian stock (e.g., `/api/stocks/RELIANCE.NS` or `/api/stocks/TCS`)

### `POST /api/chat`
Send a message to Mr. Warren and get AI-powered investment advice for Indian stocks

Request body:
```json
{
  "message": "Analyze Reliance Industries stock",
  "conversation_history": []
}
```

## Zerodha Kite Connect Setup

To use Zerodha API for real-time stock prices, holdings, and watchlist, you need to set up Kite Connect:

### Step 1: Create Kite Connect App

1. Go to [Zerodha Kite Connect](https://kite.trade/)
2. Log in with your Zerodha account
3. Navigate to **Developers** → **My Apps**
4. Click **Create new app**
5. Fill in the details:
   - **App Name**: StockGPT (or any name)
   - **Redirect URL**: `http://localhost:8000/zerodha/callback` (or your callback URL)
   - **App Type**: Select **Read** (for fetching data only)
6. Click **Create**
7. Note down your **API Key** and **API Secret**

### Step 2: Generate Access Token

You have two options:

#### Option A: Using Python Script (Recommended)

Create a file `get_zerodha_token.py` in the backend directory:

```python
from kiteconnect import KiteConnect
import webbrowser

# Replace with your API key and secret
API_KEY = "your_api_key_here"
API_SECRET = "your_api_secret_here"

# Create Kite Connect instance
kite = KiteConnect(api_key=API_KEY)

# Generate login URL
login_url = kite.login_url()
print(f"Please visit this URL and authorize: {login_url}")
webbrowser.open(login_url)

# After authorization, you'll be redirected to your redirect URL
# Copy the request_token from the URL (it looks like: ?request_token=xxxxx&action=login&status=success)
request_token = input("Enter the request_token from the redirect URL: ")

# Generate access token
data = kite.generate_session(request_token, api_secret=API_SECRET)
access_token = data["access_token"]

print(f"\nYour Access Token: {access_token}")
print(f"\nAdd these to your .env file:")
print(f"ZERODHA_API_KEY={API_KEY}")
print(f"ZERODHA_API_SECRET={API_SECRET}")
print(f"ZERODHA_ACCESS_TOKEN={access_token}")
```

Run the script:
```bash
cd backend
python get_zerodha_token.py
```

#### Option B: Manual Method

1. Visit: `https://kite.trade/connect/login?api_key=YOUR_API_KEY&v=3`
   (Replace `YOUR_API_KEY` with your actual API key)

2. Log in with your Zerodha credentials and authorize the app

3. You'll be redirected to your redirect URL with a `request_token` parameter

4. Copy the `request_token` from the URL

5. Use this Python code to generate access token:

```python
from kiteconnect import KiteConnect

API_KEY = "your_api_key"
API_SECRET = "your_api_secret"
REQUEST_TOKEN = "request_token_from_url"

kite = KiteConnect(api_key=API_KEY)
data = kite.generate_session(REQUEST_TOKEN, api_secret=API_SECRET)
print("Access Token:", data["access_token"])
```

### Step 3: Add to Environment File

Add the credentials to your `backend/.env` file:

```
ZERODHA_API_KEY=your_api_key_here
ZERODHA_API_SECRET=your_api_secret_here
ZERODHA_ACCESS_TOKEN=your_access_token_here
```

### Step 4: Restart Backend

Restart your backend server to load the new credentials.

### Important Notes:

- **Access Token Validity**: Access tokens are valid until you log out or change your password. If it expires, regenerate it using the same process.
- **Read-Only Access**: For security, use **Read** permissions only (no trading capabilities)
- **Redirect URL**: Must match exactly what you set in Kite Connect app settings
- **Rate Limits**: Zerodha API has rate limits - the app handles this with delays between requests

## Notes

- **Indian Market Focus**: The platform is designed exclusively for Indian stocks listed on NSE (National Stock Exchange) and BSE (Bombay Stock Exchange)
- **Stock Symbols**: Use NSE symbols (e.g., RELIANCE, TCS, HDFCBANK) - the system automatically adds .NS suffix
- **Data Source**: Stock data is fetched from Zerodha Kite Connect API (real-time) or NSE tools (free alternative) or Yahoo Finance (fallback)
- **AI Model**: Uses GPT-5.2 (or latest available model) for analysis
- **Real-time Updates**: Index data updates every 10 seconds, ticker stocks update every 30 seconds
- **Indian Market Context**: All analysis considers Indian market dynamics, regulatory environment, and economic factors
- **Watchlist**: Your watchlist is saved in browser localStorage, plus Zerodha watchlist integration
- **Chat Focus**: Mr. Warren only provides analysis for Indian stocks - US/international stocks are redirected
- **Zerodha Integration**: Optional but recommended for real-time prices, holdings, and watchlist from your Zerodha account

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.