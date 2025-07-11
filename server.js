require('dotenv').config(); // Loads .env file for local development
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { processPredictionCycle } = require('./predictionLogic.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
// This allows your frontend to make requests to this server.
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'; // Use '*' for development if needed, but be specific in production
const corsOptions = {
  origin: allowedOrigin
};
app.use(cors(corsOptions));


// --- PATHS FOR DATA PERSISTENCE ---
const DATA_DIR = process.env.RENDER_DISK_PATH || __dirname;
const GAME_DATA_PATH = path.join(DATA_DIR, 'gameData.json');
const APP_STATE_PATH = path.join(DATA_DIR, 'appState.json');

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created data directory at: ${DATA_DIR}`);
}

app.use(express.json());

// --- API Key Middleware ---
// This middleware protects your endpoints.
const requireApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  const serverApiKey = process.env.API_KEY;

  if (!serverApiKey) {
      console.error("API_KEY environment variable is not set on the server.");
      return res.status(500).json({ error: 'Server configuration error.' });
  }

  if (!apiKey || apiKey !== serverApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};


// --- APPLICATION STATE MANAGEMENT ---
let appState = {
    historyData: [],
    lastProcessedPeriodId: null,
    currentSystemLosses: 0,
    nextPrediction: null
};

function loadAppState() {
    if (fs.existsSync(APP_STATE_PATH)) {
        try {
            const rawData = fs.readFileSync(APP_STATE_PATH, 'utf8');
            appState = JSON.parse(rawData);
            console.log("Application state loaded successfully.");
        } catch (error) {
            console.error("Could not load app state, starting fresh.", error);
            appState = { historyData: [], lastProcessedPeriodId: null, currentSystemLosses: 0, nextPrediction: null };
        }
    }
}

function saveAppState() {
    try {
        fs.writeFileSync(APP_STATE_PATH, JSON.stringify(appState, null, 2));
    } catch (error) {
        console.error("Failed to save app state:", error);
    }
}

// --- DATA COLLECTION & PREDICTION CYCLE ---
async function mainCycle() {
    console.log('Fetching latest game data...');
    try {
        const response = await fetch(
            "https://api.fantasygamesapi.com/api/webapi/GetNoaverageEmerdList",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pageSize: 10,
                    pageNo: 1,
                    typeId: 1,
                    language: 0,
                    random: "4a0522c6ecd8410496260e686be2a57c",
                    signature: "334B5E70A0C9B8918B0B15E517E2069C",
                    timestamp: Math.floor(Date.now() / 1000),
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const apiData = await response.json();
        
        if (apiData && apiData.data && apiData.data.list && apiData.data.list.length > 0) {
            const latestGameResult = apiData.data.list[0];

            const gameDataStore = fs.existsSync(GAME_DATA_PATH) ? JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8')) : { history: [] };
            if (!gameDataStore.history.some(h => h.issueNumber === latestGameResult.issueNumber)) {
                gameDataStore.history.unshift(latestGameResult);
                gameDataStore.history = gameDataStore.history.slice(0, 5000);
                fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(gameDataStore, null, 2));
                console.log(`Stored new game result for period ${latestGameResult.issueNumber}`);
            }
            
            if (String(latestGameResult.issueNumber) !== appState.lastProcessedPeriodId) {
                console.log(`New period detected. Old: ${appState.lastProcessedPeriodId}, New: ${latestGameResult.issueNumber}. Running prediction cycle.`);
                
                const result = await processPredictionCycle(latestGameResult, appState.historyData, appState.lastProcessedPeriodId);
                
                if (result) {
                    appState.historyData = result.updatedHistoryData;
                    appState.lastProcessedPeriodId = result.lastProcessedPeriodId;
                    appState.currentSystemLosses = result.updatedSystemLosses;
                    appState.nextPrediction = {
                        prediction: result.nextPeriodPrediction,
                        number: result.nextPeriodPredictedNumber,
                        confidence: result.nextPeriodConfidence,
                        rationale: result.rationale
                    };
                    saveAppState();
                    console.log(`Prediction generated for next period: ${appState.nextPrediction.prediction} with ${appState.nextPrediction.confidence}% confidence.`);
                }
            } else {
                console.log(`Period ${latestGameResult.issueNumber} already processed. Waiting for next.`);
            }
        }
    } catch (error) {
        console.error('Main cycle failed:', error);
    }
}

// Run the main cycle every 30 seconds.
setInterval(mainCycle, 30000);

// --- API ENDPOINTS ---

// FIX: Changed to GET and now returns the period number with the prediction.
app.get('/predict', requireApiKey, (req, res) => {
    if (appState.nextPrediction && appState.lastProcessedPeriodId) {
        const nextPeriod = (BigInt(appState.lastProcessedPeriodId) + 1n).toString();
        res.json({
            period: nextPeriod,
            finalDecision: appState.nextPrediction.prediction,
            finalConfidence: appState.nextPrediction.confidence,
        });
    } else {
        res.status(404).json({ error: 'Prediction not available yet. Please wait for the next cycle.' });
    }
});

// NEW: Added this endpoint to allow the frontend to check for results.
app.get('/get-result', requireApiKey, (req, res) => {
    const { period } = req.query;

    if (!period) {
        return res.status(400).json({ error: 'Period query parameter is required.' });
    }

    if (!fs.existsSync(GAME_DATA_PATH)) {
        return res.status(404).json({ error: 'Game data file not found.' });
    }

    try {
        const gameDataStore = JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8'));
        const result = gameDataStore.history.find(item => String(item.issueNumber) === String(period));

        if (result) {
            res.json({ period: result.issueNumber, number: result.number });
        } else {
            res.status(404).json({ error: `Result for period ${period} not found.` });
        }
    } catch (error) {
        console.error(`Error in /get-result:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


app.get('/game-data', requireApiKey, (req, res) => {
    if (fs.existsSync(GAME_DATA_PATH)) {
        res.sendFile(GAME_DATA_PATH);
    } else {
        res.status(404).json({ history: [] });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    loadAppState();
    mainCycle(); // Run once on startup
});
