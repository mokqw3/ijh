require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { ultraAIPredict } = require('./predictionLogic.js');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const requireApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  const serverApiKey = process.env.API_KEY; // This is the PUBLIC key for the frontend
  if (!serverApiKey || apiKey !== serverApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};

const DATA_DIR = process.env.RENDER_DISK_PATH || __dirname;
const APP_STATE_PATH = path.join(DATA_DIR, 'appState.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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

async function mainCycle() {
    console.log('Prediction Server: Fetching latest game data from data collector...');
    try {
        const response = await fetch(
            "https://datacollectorserver-gqe1.onrender.com/", // Calling the new, simplified root endpoint
            {
                method: "GET",
                headers: { 
                    "Content-Type": "application/json",
                    "x-api-key": process.env.INTERNAL_API_KEY // Using the internal key from env vars
                }
            }
        );

        if (!response.ok) throw new Error(`Data Collector API responded with status: ${response.status}`);

        const apiData = await response.json();
        if (!apiData?.history?.length) {
            console.log("No history data received from collector yet.");
            return;
        }

        const latestGameResult = apiData.history[0];
        const periodId = String(latestGameResult.issueNumber);
        
        if (app.locals.nextPrediction && (BigInt(app.locals.nextPrediction.period) > BigInt(periodId))) {
            console.log(`Period ${periodId} already processed. Waiting for new data.`);
            return;
        }
            
        if (app.locals.sharedStats.lastPredictedOutcome) {
             app.locals.sharedStats.lastActualOutcome = latestGameResult.number;
        }

        const nextPeriod = (BigInt(periodId) + 1n).toString();
        console.log(`Running prediction for next period: ${nextPeriod}`);
        
        const prediction = ultraAIPredict(apiData.history, app.locals.sharedStats);
        
        app.locals.nextPrediction = {
            period: nextPeriod,
            ...prediction
        };
        
        saveState();
        
    } catch (error) {
        console.error('Main cycle failed:', error);
    }
}

setInterval(mainCycle, 15000); // Check for new data every 15 seconds

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

// This endpoint is now deprecated, as the collector is the source of truth.
app.get('/game-data', requireApiKey, (req, res) => {
     res.status(404).json({ error: "Direct game data access is deprecated. Use the data collector service." });
});

app.get('/status', requireApiKey, async (req, res) => {
    try {
        const collectorResponse = await fetch("https://datacollectorserver-gqe1.onrender.com/", { headers: { "x-api-key": process.env.INTERNAL_API_KEY }});
        const data = await collectorResponse.json();
        res.json({ collectedDataCount: data.history?.length || 0 });
    } catch (error) {
        console.error(`Error in /status:`, error);
        res.status(500).json({ error: 'Internal server error while fetching status from collector.' });
    }
});

// A simple endpoint for uptime monitors
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.listen(PORT, () => {
    console.log(`Prediction Server is running on http://localhost:${PORT}`);
    loadState();
    mainCycle(); 
});
