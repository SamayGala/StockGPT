# StockGPT - Mr. Warren's Investment Advisor

A modern, AI-powered stock analysis platform featuring Mr. Warren, an AI assistant that provides investment advice in the persona of Warren Buffett. Get comprehensive stock analysis focusing on value investing principles, business fundamentals, and intrinsic value.

## Features

- 🤖 **Mr. Warren AI Assistant**: Get investment advice in Warren Buffett's style
- 📊 **Real-time Market Indexes**: View live data for Sensex, Nifty50, S&P 500, and Nasdaq
- 💬 **Interactive Chat Interface**: Ask questions about US and Indian stocks
- 📈 **Comprehensive Analysis**: Get insights on:
  - Core business analysis
  - Management quality assessment
  - Intrinsic value evaluation
  - P/E, P/B ratio analysis
  - Strong Buy/Hold/Sell recommendations
  - Price targets based on value investing

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
2. View the real-time market indexes on the left panel
3. Start chatting with Mr. Warren by asking questions like:
   - "Analyze Apple stock"
   - "What do you think about Reliance Industries?"
   - "Should I buy Tesla at current prices?"
   - "Compare Microsoft and Google stocks"

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
Returns real-time data for major stock indexes (Sensex, Nifty50, S&P 500, Nasdaq)

### `POST /api/chat`
Send a message to Mr. Warren and get AI-powered investment advice

Request body:
```json
{
  "message": "Analyze Apple stock",
  "conversation_history": []
}
```

## Notes

- The AI uses GPT-4 Turbo (the latest available model) as "ChatGPT 5.2" doesn't exist yet
- Stock index data is fetched from Yahoo Finance and updates every minute
- The AI maintains conversation context for better responses
- All responses are in Warren Buffett's investment philosophy style

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.