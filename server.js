require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { ultraAIPredict } = require('./predictionLogic.js');
const fetch = require('node-fetch');

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

// --- PATHS & STATE MANAGEMENT (using local JSON files on a persistent disk) ---
const DATA_DIR = process.env.RENDER_DISK_PATH || __dirname;
const GAME_DATA_PATH = path.join(DATA_DIR, 'gameData.json');
const APP_STATE_PATH = path.join(DATA_DIR, 'appState.json');

// Ensure the data directory exists on startup
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created data directory at: ${DATA_DIR}`);
}

app.locals.sharedStats = {};
app.locals.nextPrediction = null; 

function loadState() {
    if (fs.existsSync(APP_STATE_PATH)) {
        try {
            const rawData = fs.readFileSync(APP_STATE_PATH, 'utf8');
            app.locals.sharedStats = JSON.parse(rawData);
            console.log("Prediction engine state loaded from appState.json.");
        } catch (error) {
            console.error("Could not load prediction state, starting fresh.", error);
            app.locals.sharedStats = {};
        }
    }
}

function saveState() {
    try {
        fs.writeFileSync(APP_STATE_PATH, JSON.stringify(app.locals.sharedStats, null, 2));
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

        if (!gameDataStore.history.some(h => h.issueNumber === latestGameResult.issueNumber)) {
            
            if (app.locals.sharedStats.lastPredictedOutcome) {
                 app.locals.sharedStats.lastActualOutcome = latestGameResult.number;
            }

            gameDataStore.history.unshift(latestGameResult);
            fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(gameDataStore, null, 2));
            console.log(`Stored new game result for period ${latestGameResult.issueNumber}. Total records: ${gameDataStore.history.length}`);
            
            const nextPeriod = (BigInt(latestGameResult.issueNumber) + 1n).toString();
            console.log(`Running prediction for next period: ${nextPeriod}`);
            
            const prediction = ultraAIPredict(gameDataStore.history, app.locals.sharedStats);
            
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

setInterval(mainCycle, 20000);

// --- Keep-Alive Function ---
const keepAlive = () => {
    const serviceUrl = process.env.RENDER_EXTERNAL_URL;
    if (serviceUrl) {
        fetch(serviceUrl + '/ping').then(() => console.log(`Keep-alive ping sent to ${serviceUrl}`)).catch(err => console.error("Keep-alive ping failed:", err));
    }
};
setInterval(keepAlive, 14 * 60 * 1000);

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

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    loadState();
    mainCycle(); 
});
