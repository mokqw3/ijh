require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
// Import the new prediction engine
const { ultraAIPredict, getBigSmallFromNumber } = require('./predictionLogic.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'; 
const corsOptions = {
  origin: allowedOrigin
};
app.use(cors(corsOptions));
app.use(express.json());

// --- API Key Middleware ---
const requireApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  const serverApiKey = process.env.API_KEY;

  if (!serverApiKey) {
      console.error("FATAL: API_KEY environment variable is not set on the server.");
      return res.status(500).json({ error: 'Server configuration error: API Key not set.' });
  }

  if (!apiKey || apiKey !== serverApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};

// --- PATHS & STATE MANAGEMENT ---
const DATA_DIR = process.env.RENDER_DISK_PATH || __dirname;
const GAME_DATA_PATH = path.join(DATA_DIR, 'gameData.json');
const APP_STATE_PATH = path.join(DATA_DIR, 'appState.json');

let sharedStats = {}; // This will hold the persistent state for the prediction engine
app.locals.nextPrediction = null; // Store nextPrediction on the app object

function loadState() {
    if (fs.existsSync(APP_STATE_PATH)) {
        try {
            const rawData = fs.readFileSync(APP_STATE_PATH, 'utf8');
            sharedStats = JSON.parse(rawData);
            console.log("Prediction engine state loaded successfully.");
        } catch (error) {
            console.error("Could not load prediction state, starting fresh.", error);
            sharedStats = {};
        }
    }
}

function saveState() {
    try {
        fs.writeFileSync(APP_STATE_PATH, JSON.stringify(sharedStats, null, 2));
    } catch (error) {
        console.error("Failed to save prediction state:", error);
    }
}

// --- Main Data & Prediction Cycle ---
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

        if (!response.ok) throw new Error(`API responded with status: ${response.status}`);

        const apiData = await response.json();
        if (!apiData?.data?.list?.length) return;

        const latestGameResult = apiData.data.list[0];
        const gameDataStore = fs.existsSync(GAME_DATA_PATH) ? JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8')) : { history: [] };

        // Check if the latest result is new
        if (!gameDataStore.history.some(h => h.issueNumber === latestGameResult.issueNumber)) {
            const newEntry = {
                period: String(latestGameResult.issueNumber),
                actual: latestGameResult.number,
                actualNumber: latestGameResult.number, 
                status: 'resolved'
            };

            if (sharedStats.lastPredictedOutcome) {
                 sharedStats.lastActualOutcome = newEntry.actual;
            }

            gameDataStore.history.unshift(latestGameResult);
            if (gameDataStore.history.length > 500) gameDataStore.history.length = 500;
            fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(gameDataStore, null, 2));
            console.log(`Stored new game result for period ${latestGameResult.issueNumber}`);

            const nextPeriod = (BigInt(latestGameResult.issueNumber) + 1n).toString();
            console.log(`Running prediction for next period: ${nextPeriod}`);
            
            const prediction = ultraAIPredict(gameDataStore.history, sharedStats);
            
            app.locals.nextPrediction = {
                period: nextPeriod,
                ...prediction
            };
            
            saveState();
        }
    } catch (error) {
        console.error('Main cycle failed:', error);
    }
}

// Fetch data every 10 seconds for faster updates
setInterval(mainCycle, 10000); 

// --- API ENDPOINTS ---
app.get('/predict', requireApiKey, (req, res) => {
    if (app.locals.nextPrediction) {
        res.json({
            period: app.locals.nextPrediction.period,
            finalDecision: app.locals.nextPrediction.finalDecision,
            finalConfidence: app.locals.nextPrediction.finalConfidence * 100, 
        });
    } else {
        res.status(404).json({ error: 'Prediction not available yet. Please wait for the next cycle.' });
    }
});

app.get('/get-result', requireApiKey, (req, res) => {
    const { period } = req.query;
    if (!period) return res.status(400).json({ error: 'Period query parameter is required.' });
    if (!fs.existsSync(GAME_DATA_PATH)) return res.status(404).json({ error: 'Game data file not found.' });
    
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

app.get('/status', requireApiKey, (req, res) => {
    if (!fs.existsSync(GAME_DATA_PATH)) {
        return res.json({ collectedDataCount: 0 });
    }
    try {
        const gameDataStore = JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8'));
        const count = gameDataStore.history?.length || 0;
        res.json({ collectedDataCount: count });
    } catch (error) {
        console.error(`Error in /status:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    loadState();
    mainCycle(); 
});
