require('dotenv').config();
const express = require('express');
const path = require('path'); // FIX: This line was missing
const fs = require('fs');
const cors = require('cors');
const { ultraAIPredict } = require('./predictionLogic.js');
const admin = require('firebase-admin');

// --- Firebase Admin SDK Initialization ---
try {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.GCLOUD_PROJECT,
        databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("FATAL: Firebase Admin SDK initialization failed. Ensure GOOGLE_APPLICATION_CREDENTIALS and GCLOUD_PROJECT are set correctly.", error);
    process.exit(1);
}

const db = admin.firestore();
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

let sharedStats = {};
app.locals.nextPrediction = null;

async function loadState() {
    try {
        const stateRef = db.collection('app-state').doc('main');
        const doc = await stateRef.get();
        if (doc.exists) {
            app.locals.sharedStats = doc.data();
            console.log("Prediction engine state loaded from Firestore.");
        } else {
            console.log("No prediction state found in Firestore, starting fresh.");
            app.locals.sharedStats = {};
        }
    } catch (error) {
        console.error("Could not load prediction state from Firestore, starting fresh.", error);
        app.locals.sharedStats = {};
    }
}

async function saveState() {
    try {
        const stateRef = db.collection('app-state').doc('main');
        await stateRef.set(app.locals.sharedStats);
    } catch (error) {
        console.error("Failed to save prediction state to Firestore:", error);
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
        const periodId = String(latestGameResult.issueNumber);
        const gameResultRef = db.collection('game-history').doc(periodId);
        
        const doc = await gameResultRef.get();
        if (!doc.exists) {
            await gameResultRef.set(latestGameResult);
            console.log(`Stored new game result for period ${periodId}`);

            const historySnapshot = await db.collection('game-history').orderBy('issueNumber', 'desc').limit(200).get();
            const history = historySnapshot.docs.map(doc => doc.data());
            
            if (app.locals.sharedStats.lastPredictedOutcome) {
                 app.locals.sharedStats.lastActualOutcome = latestGameResult.number;
            }

            const nextPeriod = (BigInt(periodId) + 1n).toString();
            console.log(`Running prediction for next period: ${nextPeriod}`);
            
            const prediction = ultraAIPredict(history, app.locals.sharedStats);
            
            app.locals.nextPrediction = {
                period: nextPeriod,
                ...prediction
            };
            
            await saveState();

            const countSnapshot = await db.collection('game-history').count().get();
            const count = countSnapshot.data().count;
            if (count > 50000) {
                const oldDocsSnapshot = await db.collection('game-history').orderBy('issueNumber', 'asc').limit(count - 50000).get();
                const batch = db.batch();
                oldDocsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log(`Pruned ${oldDocsSnapshot.size} old records.`);
            }
        }
    } catch (error) {
        console.error('Main cycle failed:', error);
    }
}

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

app.get('/get-result', requireApiKey, async (req, res) => {
    const { period } = req.query;
    if (!period) return res.status(400).json({ error: 'Period query parameter is required.' });
    
    try {
        const docRef = db.collection('game-history').doc(String(period));
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            res.json({ period: data.issueNumber, number: data.number });
        } else {
            res.status(404).json({ error: `Result for period ${period} not found.` });
        }
    } catch (error) {
        console.error(`Error in /get-result:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/game-data', requireApiKey, async (req, res) => {
    try {
        const snapshot = await db.collection('game-history').orderBy('issueNumber', 'desc').limit(200).get();
        const history = snapshot.docs.map(doc => doc.data());
        res.json({ history });
    } catch (error) {
         console.error(`Error in /game-data:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/status', requireApiKey, async (req, res) => {
    try {
        const snapshot = await db.collection('game-history').count().get();
        res.json({ collectedDataCount: snapshot.data().count });
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
