require('dotenv').config(); // Loads .env file for local development
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const fetch = require('node-fetch'); // Required for making HTTP requests in Node.js

// IMPORTANT: Make sure you have renamed 'predictionLogic.js - Quantum AI Su.txt' to 'predictionLogic.js'
const { ultraAIPredict } = require('./predictionLogic.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
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
const requireApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  // Use the PUBLIC_API_KEY for client-facing endpoints
  // It's best to set this in your Render environment variables.
  const serverApiKey = process.env.PUBLIC_API_KEY || 'b5f9c2a1-8d4e-5b8g-9c2f-7g3d4e5f6a7b-public';

  if (!serverApiKey) {
      console.error("PUBLIC_API_KEY environment variable is not set on the server.");
      return res.status(500).json({ error: 'Server configuration error.' });
  }

  if (!apiKey || apiKey !== serverApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};


// --- APPLICATION STATE MANAGEMENT ---
let appState = {
    lastProcessedPeriodId: null,
    predictionState: {}, // This will hold the entire state object for ultraAIPredict
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
            appState = { lastProcessedPeriodId: null, predictionState: {}, nextPrediction: null };
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
    console.log('Fetching latest game data from data collector server...');
    try {
        // Fetching from your data collector server.
        // The INTERNAL_API_KEY should be set in your Render environment variables.
        const internalApiKey = process.env.INTERNAL_API_KEY || "a4e8f1b2-9c3d-4a7f-8b1e-6f2c3d4a5b6c-internal";
        const response = await fetch(
            "https://datacollectorserver-gqe1.onrender.com/game-data",
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": internalApiKey
                }
            }
        );

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API responded with status: ${response.status}. Body: ${errorBody}`);
        }

        const apiData = await response.json();

        let recentGames = [];
        if (apiData && Array.isArray(apiData.history)) {
             recentGames = apiData.history;
        } else if (apiData && Array.isArray(apiData)) {
             recentGames = apiData;
        }

        if (recentGames.length > 0) {
            const latestGameResult = recentGames[0];

            if (!latestGameResult.issueNumber) {
                console.error("Fetched game data is missing 'issueNumber'. Skipping processing.", latestGameResult);
                return;
            }

            const gameDataStore = fs.existsSync(GAME_DATA_PATH) ? JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8')) : { history: [] };
            if (!gameDataStore.history.some(h => String(h.issueNumber) === String(latestGameResult.issueNumber))) {
                gameDataStore.history.unshift(latestGameResult);
                gameDataStore.history = gameDataStore.history.slice(0, 5000);
                fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(gameDataStore, null, 2));
                console.log(`Stored new game result for period ${latestGameResult.issueNumber}`);
            }

            if (String(latestGameResult.issueNumber) !== appState.lastProcessedPeriodId) {
                console.log(`New period detected. Old: ${appState.lastProcessedPeriodId}, New: ${latestGameResult.issueNumber}. Running prediction cycle.`);

                const historyForPrediction = gameDataStore.history;
                const predictionResult = await ultraAIPredict(historyForPrediction, appState.predictionState);

                appState.predictionState = predictionResult;
                appState.lastProcessedPeriodId = String(latestGameResult.issueNumber);
                appState.nextPrediction = {
                    prediction: predictionResult.finalDecision,
                    confidence: predictionResult.finalConfidence,
                    rationale: predictionResult.overallLogic
                };
                saveAppState();
                console.log(`Prediction generated for next period: ${appState.nextPrediction.prediction} with confidence ${appState.nextPrediction.confidence.toFixed(4)}.`);
            } else {
                console.log(`Period ${latestGameResult.issueNumber} already processed. Waiting for next.`);
            }
        } else {
             console.log('No new game data found in the response.');
        }
    } catch (error) {
        console.error('Main cycle failed:', error);
    }
}

// Run the main cycle every 30 seconds.
setInterval(mainCycle, 30000);

// --- API ENDPOINTS ---

app.get('/predict', requireApiKey, (req, res) => {
    if (appState.nextPrediction && appState.lastProcessedPeriodId) {
        const nextPeriod = (BigInt(appState.lastProcessedPeriodId) + 1n).toString();
        res.json({
            period: nextPeriod,
            finalDecision: appState.nextPrediction.prediction,
            finalConfidence: appState.nextPrediction.confidence,
            logic: appState.nextPrediction.rationale
        });
    } else {
        res.status(404).json({ error: 'Prediction not available yet. Please wait for the next cycle.' });
    }
});

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

// NEW: Added this endpoint to provide the data collection status to the UI
app.get('/status', requireApiKey, (req, res) => {
    let count = 0;
    if (fs.existsSync(GAME_DATA_PATH)) {
        try {
            const gameDataStore = JSON.parse(fs.readFileSync(GAME_DATA_PATH, 'utf8'));
            count = gameDataStore.history.length;
        } catch (error) {
            console.error("Error reading game data for status:", error);
        }
    }
    res.json({ collectedDataCount: count });
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    loadAppState();
    mainCycle(); // Run once on startup
});
