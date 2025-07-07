// This is the full, corrected prediction logic from your file.
const fetch = require('node-fetch');

// --- Global State & Configuration ---
const STATE_STORAGE_KEY = 'combined_prediction_engine_state_v2';

let signalPerformance = {};
let REGIME_SIGNAL_PROFILES = {};
let driftDetector = {
    ewma: 0.5,
    lambda: 0.15,
    warningThreshold: 0.07,
    driftThreshold: 0.12,
    baselineError: 0.5,
    recentErrors: []
};
let consecutiveHighConfLosses = 0;
let reflexiveCorrectionActive = 0;
let engineMode = "NORMAL";
let qTable = {};
let GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = 0.5;
let heuristicPerformance = {};
let systemConsecutiveLosses = 0;

// --- Constants for Dynamic Weighting and Learning ---
const PERFORMANCE_WINDOW = 30;
const MIN_OBSERVATIONS_FOR_ADJUST = 8;
const MAX_WEIGHT_FACTOR = 2.0;
const MIN_WEIGHT_FACTOR = 0.05;
const MAX_ALPHA_FACTOR = 1.7;
const MIN_ALPHA_FACTOR = 0.3;
const MIN_ABSOLUTE_WEIGHT = 0.0003;
const ALPHA_UPDATE_RATE = 0.06;
const PROBATION_THRESHOLD_ACCURACY = 0.40;
const PROBATION_MIN_OBSERVATIONS = 15;
const PROBATION_WEIGHT_CAP = 0.10;
const REGIME_ACCURACY_WINDOW = 35;
const REGIME_LEARNING_RATE_BASE = 0.028;
const Q_LEARNING_RATE = 0.1;
const Q_DISCOUNT_FACTOR = 0.9;
const Q_REWARD_WIN = 1;
const Q_REWARD_LOSS = -1;

const defaultHeuristicPerformance = {
    'Pattern_LHT': { correct: 0, total: 0 },
    'Frequency_LHT': { correct: 0, total: 0 },
    'Recovery_LHT': { correct: 0, total: 0 },
    'Balance_LHT': { correct: 0, total: 0 },
    'Trend_LHT': { correct: 0, total: 0 },
    'Oscillation_LHT': { correct: 0, total: 0 },
    'MicroTrend_LHT': { correct: 0, total: 0 },
    'Deviation_LHT': { correct: 0, total: 0 },
    'Simple_LHT': { correct: 0, total: 0 },
    'ATS-Numerology_TX': { correct: 0, total: 0 },
    'ATS-ARIMA_TX': { correct: 0, total: 0 },
    'ATS-LSTM-Pattern_TX': { correct: 0, total: 0 },
    'ATS-Q-Learning_TX': { correct: 0, total: 0 },
    'Ichimoku_TX': { correct: 0, total: 0 },
    'RSI_TX': { correct: 0, total: 0 },
    'Stochastic_TX': { correct: 0, total: 0 },
    'Vol-Trend-Fusion_TX': { correct: 0, total: 0 }
};

// --- State Persistence Functions ---
function savePredictionEngineState() {
    try {
        const state = {
            signalPerformance,
            REGIME_SIGNAL_PROFILES,
            driftDetector,
            consecutiveHighConfLosses,
            reflexiveCorrectionActive,
            engineMode,
            qTable,
            GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE,
            heuristicPerformance,
            systemConsecutiveLosses
        };
        // In a server environment, this would write to a file, not localStorage
        console.log("[STATE] Prediction engine state updated in memory.");
    } catch (error) {
        console.error(`[STATE] Error saving state: ${error.message}`);
    }
}

function loadPredictionEngineState() {
    try {
        // In a server environment, we'd load from a file. For now, we initialize.
        console.log("[STATE] Initializing new state for server instance.");
        initializeRegimeProfiles();
        initializeHeuristicPerformance();
    } catch (error) {
        console.error(`[STATE] Error loading state. Initializing new state.`);
        initializeRegimeProfiles();
        initializeHeuristicPerformance();
    }
}

function initializeRegimeProfiles() {
    REGIME_SIGNAL_PROFILES = {
        "TREND_STRONG_LOW_VOL": { baseWeightMultiplier: 1.40, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'volBreak', 'leadLag', 'stateSpace', 'fusion', 'ats', 'pattern', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.40, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "TREND_STRONG_MED_VOL": { baseWeightMultiplier: 1.30, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'pattern', 'leadLag', 'stateSpace', 'fusion', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.30, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "TREND_STRONG_HIGH_VOL": { baseWeightMultiplier: 0.80, activeSignalTypes: ['trend', 'ichimoku', 'entropy', 'volPersist', 'zScore', 'fusion', 'ats', 'pattern', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 0.80, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "TREND_MOD_LOW_VOL": { baseWeightMultiplier: 1.25, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'pattern', 'volBreak', 'leadLag', 'stateSpace', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.25, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "TREND_MOD_MED_VOL": { baseWeightMultiplier: 1.20, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'pattern', 'rsi', 'leadLag', 'bayesian', 'fusion', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.20, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "TREND_MOD_HIGH_VOL": { baseWeightMultiplier: 0.85, activeSignalTypes: ['trend', 'ichimoku', 'meanRev', 'stochastic', 'volPersist', 'zScore', 'ats', 'pattern', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 0.85, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "RANGE_LOW_VOL": { baseWeightMultiplier: 1.20, activeSignalTypes: ['meanRev', 'pattern', 'volBreak', 'stochastic', 'harmonic', 'fractalDim', 'zScore', 'bayesian', 'fusion', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.20, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "RANGE_MED_VOL": { baseWeightMultiplier: 1.10, activeSignalTypes: ['meanRev', 'pattern', 'stochastic', 'rsi', 'bollinger', 'harmonic', 'zScore', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 1.10, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "RANGE_HIGH_VOL": { baseWeightMultiplier: 0.75, activeSignalTypes: ['meanRev', 'entropy', 'bollinger', 'vwapDev', 'volPersist', 'zScore', 'fusion', 'ats', 'pattern', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 0.75, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "WEAK_HIGH_VOL": { baseWeightMultiplier: 0.70, activeSignalTypes: ['meanRev', 'entropy', 'stochastic', 'volPersist', 'fractalDim', 'zScore', 'ats', 'pattern', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 0.70, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "WEAK_MED_VOL": { baseWeightMultiplier: 0.80, activeSignalTypes: ['momentum', 'meanRev', 'pattern', 'rsi', 'fractalDim', 'bayesian', 'ats', 'frequency', 'balance', 'oscillation', 'microTrend', 'deviation'], contextualAggression: 0.80, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "WEAK_LOW_VOL": { baseWeightMultiplier: 0.90, activeSignalTypes: ['all'], contextualAggression: 0.90, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
        "DEFAULT": { baseWeightMultiplier: 1.0, activeSignalTypes: ['all'], contextualAggression: 1.0, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 }
    };
}

function initializeHeuristicPerformance() {
    if (!heuristicPerformance || Object.keys(heuristicPerformance).length === 0) {
        heuristicPerformance = {};
    }
    for (const key in defaultHeuristicPerformance) {
        if (defaultHeuristicPerformance.hasOwnProperty(key) && !heuristicPerformance.hasOwnProperty(key)) {
            heuristicPerformance[key] = { ...defaultHeuristicPerformance[key] };
        }
    }
}

// --- Helper Functions ---
function getBigSmallType(number) {
    if (number === undefined || number === null || isNaN(number)) return null;
    const num = parseInt(number);
    if (num >= 0 && num <= 4) return 'SMALL';
    if (num >= 5 && num <= 9) return 'BIG';
    return null;
}

function getOppositeOutcome(prediction) {
    return prediction === "BIG" ? "SMALL" : prediction === "SMALL" ? "BIG" : null;
}

function mulberry32(seed) {
    seed = seed | 0;
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function calculateSMA(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const relevantData = data.slice(0, period);
    const sum = relevantData.reduce((a, b) => a + b, 0);
    return sum / period;
}

function calculateEMA(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const k = 2 / (period + 1);
    const chronologicalData = data.slice().reverse();
    let ema = calculateSMA(chronologicalData.slice(0, period), period);
    if (ema === null) return null;
    for (let i = period; i < chronologicalData.length; i++) {
        ema = (chronologicalData[i] * k) + (ema * (1 - k));
    }
    return ema;
}

function calculateStdDev(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const relevantData = data.slice(0, period);
    if (relevantData.length < 2) return null;
    const mean = relevantData.reduce((a, b) => a + b, 0) / relevantData.length;
    const variance = relevantData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / relevantData.length;
    return Math.sqrt(variance);
}

function calculateRSI(data, period) {
    if (period <= 0) return null;
    const chronologicalData = data.slice().reverse();
    if (!Array.isArray(chronologicalData) || chronologicalData.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = chronologicalData[i] - chronologicalData[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < chronologicalData.length; i++) {
        const change = chronologicalData[i] - chronologicalData[i - 1];
        let currentGain = change > 0 ? change : 0;
        let currentLoss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateStochastic(data, period, kPeriod) {
    const chronologicalData = data.slice().reverse();
    if (!Array.isArray(chronologicalData) || chronologicalData.length < period) return null;
    const kValues = [];
    for (let i = period - 1; i < chronologicalData.length; i++) {
        const slice = chronologicalData.slice(i - (period - 1), i + 1);
        const highestHigh = Math.max(...slice);
        const lowestLow = Math.min(...slice);
        const currentClose = slice[slice.length - 1];
        if (highestHigh === lowestLow) {
            kValues.push(50);
        } else {
            kValues.push(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100);
        }
    }
    if (kValues.length < kPeriod) return null;
    const dSlice = kValues.slice(kValues.length - kPeriod);
    const percentD = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;
    const percentK = kValues[kValues.length - 1];
    return { k: percentK, d: percentD };
}

function getCurrentISTHour() {
    try {
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
        const istHourString = istFormatter.formatToParts(now).find(part => part.type === 'hour').value;
        let hour = parseInt(istHourString, 10);
        if (hour === 24) hour = 0;
        return { raw: hour, sin: Math.sin(hour / 24 * 2 * Math.PI), cos: Math.cos(hour / 24 * 2 * Math.PI) };
    } catch (error) {
        console.error("Error getting IST hour:", error);
        const hour = new Date().getHours();
        return { raw: hour, sin: Math.sin(hour / 24 * 2 * Math.PI), cos: Math.cos(hour / 24 * 2 * Math.PI) };
    }
}

function getPrimeTimeSession(istHour) {
    if (istHour >= 10 && istHour < 12) return { session: "PRIME_MORNING", aggression: 1.25, confidence: 1.15 };
    if (istHour >= 13 && istHour < 14) return { session: "PRIME_AFTERNOON_1", aggression: 1.15, confidence: 1.10 };
    if (istHour >= 15 && istHour < 16) return { session: "PRIME_AFTERNOON_2", aggression: 1.15, confidence: 1.10 };
    if (istHour >= 17 && istHour < 20) {
        if (istHour === 19) return { session: "PRIME_EVENING_PEAK", aggression: 1.35, confidence: 1.25 };
        return { session: "PRIME_EVENING", aggression: 1.30, confidence: 1.20 };
    }
    return null;
}

const isPrime = num => {
    for(let i = 2, s = Math.sqrt(num); i <= s; i++)
        if(num % i === 0) return false;
    return num > 1;
}

const fibonacci = num => {
    if (num < 0) return 0;
    let a = 0, b = 1;
    while (b <= num) {
        if (b === num) return 1;
        let temp = a + b;
        a = b;
        b = temp;
    }
    return 0;
};

const calculateLyapunov = (digits) => {
    if (digits.length < 2) return 0;
    const mean = digits.reduce((a, b) => a + b, 0) / digits.length;
    const variance = digits.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / digits.length;
    return Math.sqrt(variance);
};

function calculateEntropyForSignal(outcomes, windowSize) {
    if (!Array.isArray(outcomes) || outcomes.length < windowSize) return null;
    const counts = { BIG: 0, SMALL: 0 };
    outcomes.slice(0, windowSize).forEach(o => { if (o) counts[o] = (counts[o] || 0) + 1; });
    let entropy = 0;
    const totalValidOutcomes = counts.BIG + counts.SMALL;
    if (totalValidOutcomes === 0) return 1;
    for (let key in counts) {
        if (counts[key] > 0) { const p = counts[key] / totalValidOutcomes; entropy -= p * Math.log2(p); }
    }
    return isNaN(entropy) ? 1 : entropy;
}

function applyBayesianAdjustment(bigScore, smallScore) {
    const priorBig = 0.5, priorSmall = 0.5;
    if ((bigScore + smallScore) === 0) return { big: 0.5, small: 0.5 };
    const likelihoodBig = bigScore / (bigScore + smallScore);
    const likelihoodSmall = 1 - likelihoodBig;
    const posteriorBig = likelihoodBig * priorBig;
    const posteriorSmall = likelihoodSmall * priorSmall;
    const evidence = posteriorBig + posteriorSmall;
    if (evidence === 0) return { big: 0.5, small: 0.5 };
    return {
        big: posteriorBig / evidence,
        small: posteriorSmall / evidence
    };
}

// --- LHT AI Heuristics ---
function patternHeuristic(history) {
    if (history.length < 3) return { prediction: null, confidence: 0 };
    const types = history.slice(0, 5).map(h => getBigSmallType(Number(h.actual)));
    let prediction = null;
    let confidence = 0;
    if (types.length >= 4 && types[0] === types[1] && types[1] === types[2] && types[2] === types[3]) {
        prediction = types[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 90;
    }
    else if (types.length >= 3 && types[0] === types[1] && types[1] === types[2]) {
        prediction = types[0] === "BIG" ? "SMALL" : "BIG";
        confidence = 85;
    }
    else if (types.length >= 4 && types[0] !== types[1] && types[1] === types[2] && types[2] !== types[3]) {
        prediction = types[0];
        confidence = 70;
    }
    return { prediction, confidence };
}

function frequencyHeuristic(history) {
    if (history.length < 10) return { prediction: null, confidence: 0 };
    const analysisDepth = Math.min(history.length, 40);
    const recentHistory = history.slice(0, analysisDepth);
    const bigCount = recentHistory.filter(h => getBigSmallType(Number(h.actual)) === "BIG").length;
    const smallCount = recentHistory.length - bigCount;
    let prediction = null;
    let confidence = 0;
    const longTermBiasThreshold = 0.6;
    if (bigCount / analysisDepth > longTermBiasThreshold) {
        prediction = "SMALL";
        confidence = 65 + (bigCount / analysisDepth - longTermBiasThreshold) * 100;
    } else if (smallCount / analysisDepth > longTermBiasThreshold) {
        prediction = "BIG";
        confidence = 65 + (smallCount / analysisDepth - longTermBiasThreshold) * 100;
    }
    const shortTermHistory = history.slice(0, Math.min(history.length, 15));
    const shortTermBigCount = shortTermHistory.filter(h => getBigSmallType(Number(h.actual)) === "BIG").length;
    const shortTermSmallCount = shortTermHistory.length - shortTermBigCount;
    const shortTermBiasThreshold = 0.7;
    if (shortTermBigCount / shortTermHistory.length > shortTermBiasThreshold) {
        if (prediction === "BIG") confidence = Math.max(confidence, 60);
        else { prediction = "SMALL"; confidence = Math.max(confidence, 70); }
    } else if (shortTermSmallCount / shortTermHistory.length > shortTermBiasThreshold) {
         if (prediction === "SMALL") confidence = Math.max(confidence, 60);
        else { prediction = "BIG"; confidence = Math.max(confidence, 70); }
    }
    return { prediction, confidence: Math.min(95, confidence) };
}

function recoveryHeuristic(history, currentSystemLosses) {
    if (currentSystemLosses === 0) return { prediction: null, confidence: 0 };
    const lastResolvedResults = history.filter(h => h.actual !== null).slice(0, Math.min(currentSystemLosses, 3));
    if (lastResolvedResults.length === 0) return { prediction: null, confidence: 0 };
    const lastActual = Number(lastResolvedResults[0].actual);
    if (isNaN(lastActual)) return { prediction: null, confidence: 0 };
    let prediction = null;
    let confidence = 0;
    if (currentSystemLosses === 1) {
        prediction = getBigSmallType(lastActual) === "BIG" ? "SMALL" : "BIG";
        confidence = 99.0;
    } else if (currentSystemLosses === 2) {
        if (lastResolvedResults.length >= 2) {
            const secondLastActual = Number(lastResolvedResults[1].actual);
            const lastType = getBigSmallType(lastActual);
            const secondLastType = getBigSmallType(secondLastActual);
            if (lastType === secondLastType) {
                prediction = lastType === "BIG" ? "SMALL" : "BIG";
                confidence = 99.5;
            } else {
                prediction = getBigSmallType(lastActual) === "BIG" ? "SMALL" : "BIG";
                confidence = 99.5;
            }
        } else {
            prediction = getBigSmallType(lastActual) === "BIG" ? "SMALL" : "BIG";
            confidence = 99.5;
        }
    } else if (currentSystemLosses >= 3) {
        const types = history.slice(0, Math.min(history.length, 5)).map(h => getBigSmallType(Number(h.actual)));
        const bigCount = types.filter(t => t === "BIG").length;
        const smallCount = types.length - bigCount;
        if (bigCount > smallCount + 1) {
            prediction = "SMALL";
            confidence = 100.0;
        } else if (smallCount > bigCount + 1) {
            prediction = "BIG";
            confidence = 100.0;
        } else {
            const bigWins = history.filter(h => h.status === 'win' && getBigSmallType(Number(h.actual)) === "BIG").length;
            const smallWins = history.filter(h => h.status === 'win' && getBigSmallType(Number(h.actual)) === "SMALL").length;
            if (bigWins < smallWins) {
                prediction = "BIG";
                confidence = 100.0;
            } else if (smallWins < bigWins) {
                prediction = "SMALL";
                confidence = 100.0;
            } else {
                prediction = getBigSmallType(lastActual) === "BIG" ? "SMALL" : "BIG";
                confidence = 100.0;
            }
        }
    }
    return { prediction, confidence };
}

function balanceHeuristic(history) {
    if (history.length < 20) return { prediction: null, confidence: 0 };
    const longTermHistory = history.slice(0, 50);
    const bigCount = longTermHistory.filter(h => getBigSmallType(Number(h.actual)) === "BIG").length;
    const smallCount = longTermHistory.length - bigCount;
    let prediction = null;
    let confidence = 0;
    const balanceThreshold = 0.53;
    const bigRatio = bigCount / longTermHistory.length;
    const smallRatio = smallCount / longTermHistory.length;
    if (bigRatio > balanceThreshold) {
        prediction = "SMALL";
        confidence = 60 + (bigRatio - balanceThreshold) * 100;
    } else if (smallRatio > balanceThreshold) {
        prediction = "BIG";
        confidence = 60 + (smallRatio - balanceThreshold) * 100;
    }
    return { prediction, confidence: Math.min(90, confidence) };
}

function trendHeuristic(history) {
    if (history.length < 3) return { prediction: null, confidence: 0 };
    const recentTypes = history.slice(0, 5).map(h => getBigSmallType(Number(h.actual)));
    const mediumTypes = history.slice(0, 10).map(h => getBigSmallType(Number(h.actual)));
    let prediction = null;
    let confidence = 0;
    if (recentTypes.length >= 3 && recentTypes[0] === recentTypes[1] && recentTypes[1] === recentTypes[2]) {
        prediction = recentTypes[0];
        confidence = 80;
    }
    else if (recentTypes.length >= 3) {
        const lastFewBig = recentTypes.slice(0,3).filter(t => t === "BIG").length;
        const lastFewSmall = 3 - lastFewBig;
        if (lastFewBig > lastFewSmall) { prediction = "BIG"; confidence = 68;}
        else if (lastFewSmall > lastFewBig) { prediction = "SMALL"; confidence = 68; }
    }
    if (!prediction && mediumTypes.length >= 7) {
        const mediumBigCount = mediumTypes.filter(t => t === "BIG").length;
        const mediumSmallCount = mediumTypes.length - mediumBigCount;
        const mediumBiasThreshold = 0.7;
        if (mediumBigCount / mediumTypes.length > mediumBiasThreshold) { prediction = "BIG"; confidence = 70;}
        else if (mediumSmallCount / mediumTypes.length > mediumBiasThreshold) { prediction = "SMALL"; confidence = 70;}
    }
    return { prediction, confidence };
}

function oscillationHeuristic(history) {
    if (history.length < 4) return { prediction: null, confidence: 0 };
    const types = history.slice(0, 4).map(h => getBigSmallType(Number(h.actual)));
    if (types[0] !== types[1] && types[1] !== types[2] && types[2] !== types[3] && types[0] === types[2] && types[1] === types[3]) {
        return { prediction: types[0], confidence: 85 };
    }
    return { prediction: null, confidence: 0 };
}

function microTrendHeuristic(history) {
    if (history.length < 2) return { prediction: null, confidence: 0 };
    const types = history.slice(0, 2).map(h => getBigSmallType(Number(h.actual)));
    if (types.length >= 2 && types[0] === types[1]) {
        return { prediction: types[0], confidence: 65 };
    }
    return { prediction: null, confidence: 0 };
}

function deviationHeuristic(history) {
    if (history.length < 15) return { prediction: null, confidence: 0 };
    const analysisDepth = Math.min(history.length, 30);
    const recentNumbers = history.slice(0, analysisDepth).map(h => Number(h.actual));
    const bigCount = recentNumbers.filter(n => n >= 5).length;
    const smallCount = recentNumbers.filter(n => n < 5).length;
    let prediction = null;
    let confidence = 0;
    const numberBiasThreshold = 0.6;
    if (bigCount / analysisDepth > numberBiasThreshold) {
        prediction = "SMALL";
        confidence = 75 + (bigCount / analysisDepth - numberBiasThreshold) * 100;
    } else if (smallCount / analysisDepth > numberBiasThreshold) {
        prediction = "BIG";
        confidence = 75 + (smallCount / analysisDepth - numberBiasThreshold) * 100;
    }
    const oddCount = recentNumbers.filter(n => n % 2 !== 0).length;
    const evenCount = recentNumbers.filter(n => n % 2 === 0).length;
    if (oddCount / analysisDepth > numberBiasThreshold) {
        if (recentNumbers[0] % 2 !== 0) {
            prediction = (Number(recentNumbers[0]) < 5) ? "BIG" : "SMALL";
            confidence = Math.max(confidence, 70);
        }
    } else if (evenCount / analysisDepth > numberBiasThreshold) {
        if (recentNumbers[0] % 2 === 0) {
            prediction = (Number(recentNumbers[0]) < 5) ? "BIG" : "SMALL";
            confidence = Math.max(confidence, 70);
        }
    }
    return { prediction, confidence: Math.min(95, confidence) };
}

function simpleHeuristic(history) {
    if (history.length === 0 || history[0].actual === null || isNaN(Number(history[0].actual))) return { prediction: null, confidence: 0 };
    const lastActual = Number(history[0].actual);
    return {
        prediction: getBigSmallType(lastActual) === "BIG" ? "SMALL" : "BIG",
        confidence: 50
    };
}

// --- TRADE X AI Signals ---
function analyzePeriodNumerology(periodNumber) {
    if (!periodNumber) return null;
    const s = String(periodNumber);
    const digits = s.slice(-5).split('').map(Number);
    if (digits.length < 3) return null;
    const sum = digits.reduce((a, b) => a + b, 0);
    const prod = digits.reduce((a, b) => a * b, 1);
    const xor = digits.reduce((a, b) => a ^ b, 0);
    const lastDigit = digits[digits.length - 1];
    let primeScore = 0;
    digits.forEach(d => { if(isPrime(d)) primeScore++; });
    let fibScore = 0;
    digits.forEach(d => { if(fibonacci(d)) fibScore++; });
    const lyap = calculateLyapunov(digits);
    let bigScore = 0;
    let smallScore = 0;
    if (sum % 2 === 0) bigScore += sum / 10; else smallScore += sum / 10;
    if (prod > 100) bigScore += prod / 100; else smallScore += 5;
    if (xor > 5) bigScore += xor; else smallScore += xor;
    if (lastDigit > 4) bigScore += lastDigit; else smallScore += (9 - lastDigit);
    bigScore += primeScore * 5;
    smallScore += fibScore * 4;
    if (lyap > 2.5) bigScore += lyap * 2; else smallScore += lyap * 3;
    const prediction = bigScore > smallScore ? "BIG" : "SMALL";
    const confidence = Math.abs(bigScore - smallScore) / (bigScore + smallScore + 1);
    return { prediction, confidence: confidence * 100 };
}

function analyzeARIMA(history) {
    const numbers = history.map(entry => parseInt(entry.actual)).filter(n => !isNaN(n));
    if (numbers.length < 10) return null;
    const diffs = [];
    for (let i = 0; i < 9; i++) {
        diffs.push(numbers[i] - numbers[i+1]);
    }
    const avgDiff = diffs.reduce((a,b) => a+b, 0) / diffs.length;
    const forecast = numbers[0] + avgDiff;
    const prediction = forecast > 4.5 ? "BIG" : "SMALL";
    const confidence = Math.min(1.0, Math.abs(forecast - 4.5) / 4.5);
    return { prediction, confidence: confidence * 100 };
}

function analyzeLSTMPattern(history) {
    const outcomes = history.map(p => getBigSmallType(p.actual)).filter(Boolean);
    if (outcomes.length < 5) return null;
    const sequence = outcomes.slice(0, 5).join('');
    const patterns = {
        'BIGBIGSMALLSMALLBIG': { prediction: 'BIG', conf: 0.8 },
        'SMALLSMALLBIGBIGSMALL': { prediction: 'SMALL', conf: 0.8 },
        'BIGSMALLBIGSMALLBIG': { prediction: 'SMALL', conf: 0.75 },
        'SMALLBIGSMALLBIGSMALL': { prediction: 'BIG', conf: 0.75 }
    };
    if (patterns[sequence]) {
        return {
            prediction: patterns[sequence].prediction,
            confidence: patterns[sequence].conf * 100
        };
    }
    return null;
}

function getQLearningInsight(history) {
    const outcomes = history.map(p => getBigSmallType(p.actual)).filter(Boolean);
    if (outcomes.length < 4) return null;
    const state = outcomes.slice(0, 4).join('-');
    if (!qTable[state]) {
        return null;
    }
    return { state: state, qValues: { BIG: qTable[state].BIG, SMALL: qTable[state].SMALL } };
}

function analyzeIchimokuCloud(history, tenkanPeriod, kijunPeriod, senkouBPeriod) {
    if (tenkanPeriod <=0 || kijunPeriod <=0 || senkouBPeriod <=0) return null;
    const chronologicalHistory = history.slice().reverse();
    const numbers = chronologicalHistory.map(entry => parseInt(entry.actual)).filter(n => !isNaN(n));
    if (numbers.length < Math.max(senkouBPeriod, kijunPeriod) + 5) return null;
    const getHighLow = (dataSlice) => {
        if (!dataSlice || dataSlice.length === 0) return { high: null, low: null };
        return { high: Math.max(...dataSlice), low: Math.min(...dataSlice) };
    };
    const calculateLine = (data, period) => {
        const lineValues = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { lineValues.push(null); continue; }
            const { high, low } = getHighLow(data.slice(i - period + 1, i + 1));
            if (high !== null && low !== null) lineValues.push((high + low) / 2); else lineValues.push(null);
        }
        return lineValues;
    };
    const tenkanSenValues = calculateLine(numbers, tenkanPeriod);
    const kijunSenValues = calculateLine(numbers, kijunPeriod);
    const senkouSpanBValues = calculateLine(numbers, senkouBPeriod);
    const currentTenkan = tenkanSenValues[numbers.length - 1];
    const prevTenkan = tenkanSenValues[numbers.length - 2];
    const currentKijun = kijunSenValues[numbers.length - 1];
    const prevKijun = kijunSenValues[numbers.length - 2];
    const senkouSpanAValues = [];
    for(let i=0; i < numbers.length; i++) {
        if (tenkanSenValues[i] !== null && kijunSenValues[i] !== null) {
            senkouSpanAValues.push((tenkanSenValues[i] + kijunSenValues[i]) / 2);
        } else {
            senkouSpanAValues.push(null);
        }
    }
    const kijunLag = kijunPeriod;
    const currentSenkouA = (numbers.length > kijunLag && senkouSpanAValues.length > numbers.length - 1 - kijunLag) ? senkouSpanAValues[numbers.length - 1 - kijunLag] : null;
    const currentSenkouB = (numbers.length > kijunLag && senkouSpanBValues.length > numbers.length - 1 - kijunLag) ? senkouSpanBValues[numbers.length - 1 - kijunLag] : null;
    const chikouSpan = numbers[numbers.length - 1];
    const priceKijunPeriodsAgo = numbers.length > kijunPeriod ? numbers[numbers.length - 1 - kijunPeriod] : null;
    const lastPrice = numbers[numbers.length - 1];
    if (lastPrice === null || currentTenkan === null || currentKijun === null || currentSenkouA === null || currentSenkouB === null || chikouSpan === null || priceKijunPeriodsAgo === null) {
        return null;
    }
    let prediction = null;
    let strengthFactor = 0.3;
    let summary = [];
    let tkCrossSignal = null;
    if (prevTenkan !== null && prevKijun !== null) {
        if (prevTenkan <= prevKijun && currentTenkan > currentKijun) { tkCrossSignal = "BIG"; summary.push("TK Cross: Bullish"); }
        else if (prevTenkan >= prevKijun && currentTenkan < currentKijun) { tkCrossSignal = "SMALL"; summary.push("TK Cross: Bearish"); }
    }
    const cloudTop = Math.max(currentSenkouA, currentSenkouB);
    const cloudBottom = Math.min(currentSenkouA, currentSenkouB);
    let priceVsCloudSignal = null;
    if (lastPrice > cloudTop) { priceVsCloudSignal = "BIG"; summary.push("Price above Cloud (Bullish)"); }
    else if (lastPrice < cloudBottom) { priceVsCloudSignal = "SMALL"; summary.push("Price below Cloud (Bearish)"); }
    else { summary.push("Price within Cloud (Neutral)"); }
    let chikouSignal = null;
    if (priceKijunPeriodsAgo !== null) {
        if (chikouSpan > priceKijunPeriodsAgo) { chikouSignal = "BIG"; summary.push("Chikou Span above past price (Bullish)"); }
        else if (chikouSpan < priceKijunPeriodsAgo) { chikouSignal = "SMALL"; summary.push("Chikou Span below past price (Bearish)"); }
    }
    if (tkCrossSignal && tkCrossSignal === priceVsCloudSignal && tkCrossSignal === chikouSignal) {
        prediction = tkCrossSignal; strengthFactor = 0.95;
    }
    else if (priceVsCloudSignal && priceVsCloudSignal === tkCrossSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.7;
    }
    else if (priceVsCloudSignal && priceVsCloudSignal === chikouSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.65;
    }
    else if (tkCrossSignal && priceVsCloudSignal) {
        prediction = tkCrossSignal; strengthFactor = 0.55;
    }
    else if (priceVsCloudSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.5;
    }
    if (prediction) return { prediction, confidence: strengthFactor * 100, summary: `Ichimoku: ${summary.join(', ')}` };
    return null;
}

// --- Market Context, Trend, and Stability Analysis ---
function getMarketRegimeAndTrendContext(history, shortMALookback = 5, mediumMALookback = 10, longMALookback = 20) {
    const baseContext = getTrendContext(history, shortMALookback, mediumMALookback, longMALookback);
    let macroRegime = "UNCERTAIN";
    const { strength, volatility } = baseContext;
    let isTransitioning = false;
    const numbers = history.map(entry => parseInt(entry.actual)).filter(n => !isNaN(n));
    if (numbers.length > mediumMALookback + 5) {
        const prevShortMA = calculateEMA(numbers.slice(1), shortMALookback);
        const prevMediumMA = calculateEMA(numbers.slice(1), mediumMALookback);
        const currentShortMA = calculateEMA(numbers, shortMALookback);
        const currentMediumMA = calculateEMA(numbers, mediumMALookback);
        if (prevShortMA && prevMediumMA && currentShortMA && currentMediumMA) {
            if ((prevShortMA <= prevMediumMA && currentShortMA > currentMediumMA) ||
                (prevShortMA >= prevMediumMA && currentShortMA < currentMediumMA)) {
                isTransitioning = true;
            }
        }
    }
    if (strength === "STRONG") {
        if (volatility === "LOW" || volatility === "VERY_LOW") macroRegime = "TREND_STRONG_LOW_VOL";
        else if (volatility === "MEDIUM") macroRegime = "TREND_STRONG_MED_VOL";
        else macroRegime = "TREND_STRONG_HIGH_VOL";
    } else if (strength === "MODERATE") {
        if (volatility === "LOW" || volatility === "VERY_LOW") macroRegime = "TREND_MOD_LOW_VOL";
        else if (volatility === "MEDIUM") macroRegime = "TREND_MOD_MED_VOL";
        else macroRegime = "TREND_MOD_HIGH_VOL";
    } else if (strength === "RANGING") {
        if (volatility === "LOW" || volatility === "VERY_LOW") macroRegime = "RANGE_LOW_VOL";
        else if (volatility === "MEDIUM") macroRegime = "RANGE_MED_VOL";
        else macroRegime = "RANGE_HIGH_VOL";
    } else {
        if (volatility === "HIGH") macroRegime = "WEAK_HIGH_VOL";
        else if (volatility === "MEDIUM") macroRegime = "WEAK_MED_VOL";
        else macroRegime = "WEAK_LOW_VOL";
    }
    if (isTransitioning && !macroRegime.includes("TRANSITION")) {
        macroRegime += "_TRANSITION";
    }
    baseContext.macroRegime = macroRegime;
    baseContext.isTransitioning = isTransitioning;
    baseContext.details += `,Regime:${macroRegime}`;
    return baseContext;
}

function getTrendContext(history, shortMALookback = 5, mediumMALookback = 10, longMALookback = 20) {
    if (!Array.isArray(history) || history.length < longMALookback) {
        return { strength: "UNKNOWN", direction: "NONE", volatility: "UNKNOWN", details: "Insufficient history", macroRegime: "UNKNOWN_REGIME", isTransitioning: false };
    }
    const numbers = history.map(entry => parseInt(entry.actual)).filter(n => !isNaN(n));
    if (numbers.length < longMALookback) {
        return { strength: "UNKNOWN", direction: "NONE", volatility: "UNKNOWN", details: "Insufficient numbers", macroRegime: "UNKNOWN_REGIME", isTransitioning: false };
    }
    const shortMA = calculateEMA(numbers, shortMALookback);
    const mediumMA = calculateEMA(numbers, mediumMALookback);
    const longMA = calculateEMA(numbers, longMALookback);
    if (shortMA === null || mediumMA === null || longMA === null) return { strength: "UNKNOWN", direction: "NONE", volatility: "UNKNOWN", details: "MA calculation failed", macroRegime: "UNKNOWN_REGIME", isTransitioning: false };
    let direction = "NONE";
    let strength = "WEAK";
    let details = `S:${shortMA.toFixed(1)},M:${mediumMA.toFixed(1)},L:${longMA.toFixed(1)}`;
    const stdDevLong = calculateStdDev(numbers, longMALookback);
    const epsilon = 0.001;
    const normalizedSpread = (stdDevLong !== null && stdDevLong > epsilon) ? (shortMA - longMA) / stdDevLong : (shortMA - longMA) / epsilon;
    details += `,NormSpread:${normalizedSpread.toFixed(2)}`;
    if (shortMA > mediumMA && mediumMA > longMA) {
        direction = "BIG";
        if (normalizedSpread > 0.80) strength = "STRONG";
        else if (normalizedSpread > 0.45) strength = "MODERATE";
        else strength = "WEAK";
    } else if (shortMA < mediumMA && mediumMA < longMA) {
        direction = "SMALL";
        if (normalizedSpread < -0.80) strength = "STRONG";
        else if (normalizedSpread < -0.45) strength = "MODERATE";
        else strength = "WEAK";
    } else {
        strength = "RANGING";
        if (shortMA > longMA) direction = "BIG_BIASED_RANGE";
        else if (longMA > shortMA) direction = "SMALL_BIASED_RANGE";
    }
    let volatility = "UNKNOWN";
    const volSlice = numbers.slice(0, Math.min(numbers.length, 30));
    if (volSlice.length >= 15) {
        const stdDevVol = calculateStdDev(volSlice, volSlice.length);
        if (stdDevVol !== null) {
            details += ` VolStdDev:${stdDevVol.toFixed(2)}`;
            if (stdDevVol > 3.3) volatility = "HIGH";
            else if (stdDevVol > 2.0) volatility = "MEDIUM";
            else if (stdDevVol > 0.9) volatility = "LOW";
            else volatility = "VERY_LOW";
        }
    }
    return { strength, direction, volatility, details, macroRegime: "PENDING_REGIME_CLASSIFICATION", isTransitioning: false };
}

function analyzeMarketEntropyState(history, trendContext, stability) {
    const ENTROPY_WINDOW_SHORT = 10;
    const ENTROPY_WINDOW_LONG = 25;
    const VOL_CHANGE_THRESHOLD = 0.3;
    if (history.length < ENTROPY_WINDOW_LONG) return { state: "UNCERTAIN_ENTROPY", details: "Insufficient history for entropy state." };
    const outcomesShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => getBigSmallType(e.actual));
    const outcomesLong = history.slice(0, ENTROPY_WINDOW_LONG).map(e => getBigSmallType(e.actual));
    const entropyShort = calculateEntropyForSignal(outcomesShort, ENTROPY_WINDOW_SHORT);
    const entropyLong = calculateEntropyForSignal(outcomesLong, ENTROPY_WINDOW_LONG);
    const numbersShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actual)).filter(n => !isNaN(n));
    const numbersLongPrev = history.slice(ENTROPY_WINDOW_SHORT, ENTROPY_WINDOW_SHORT + ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actual)).filter(n => !isNaN(n));
    let shortTermVolatility = null, prevShortTermVolatility = null;
    if(numbersShort.length >= ENTROPY_WINDOW_SHORT * 0.8) shortTermVolatility = calculateStdDev(numbersShort, numbersShort.length);
    if(numbersLongPrev.length >= ENTROPY_WINDOW_SHORT * 0.8) prevShortTermVolatility = calculateStdDev(numbersLongPrev, numbersLongPrev.length);
    let state = "STABLE_MODERATE";
    let details = `E_S:${entropyShort?.toFixed(2)} E_L:${entropyLong?.toFixed(2)} Vol_S:${shortTermVolatility?.toFixed(2)} Vol_P:${prevShortTermVolatility?.toFixed(2)}`;
    if (entropyShort === null || entropyLong === null) return { state: "UNCERTAIN_ENTROPY", details };
    if (entropyShort < 0.5 && entropyLong < 0.6 && shortTermVolatility !== null && shortTermVolatility < 1.5) {
        state = "ORDERLY";
    }
    else if (entropyShort > 0.95 && entropyLong > 0.9) {
        if (shortTermVolatility && prevShortTermVolatility && shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && shortTermVolatility > 2.5) {
            state = "RISING_CHAOS";
        } else {
            state = "STABLE_CHAOS";
        }
    }
    else if (shortTermVolatility && prevShortTermVolatility) {
        if (shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && entropyShort > 0.85 && shortTermVolatility > 2.0) {
            state = "RISING_CHAOS";
        } else if (shortTermVolatility < prevShortTermVolatility * (1 - VOL_CHANGE_THRESHOLD) && entropyLong > 0.85 && entropyShort < 0.80) {
            state = "SUBSIDING_CHAOS";
        }
    }
    if (!stability.isStable && (state === "ORDERLY" || state === "STABLE_MODERATE")) {
        state = "POTENTIAL_CHAOS_FROM_INSTABILITY";
        details += ` | StabilityOverride: ${stability.reason}`;
    }
    return { state, details };
}

function analyzeTrendStability(history) {
    if (!Array.isArray(history) || history.length < 25) {
        return { isStable: true, reason: "Not enough data for stability check.", details: "", dominance: "NONE" };
    }
    const confirmedHistory = history.filter(p => p && (p.status === "win" || p.status === "loss") && typeof p.actual !== 'undefined' && p.actual !== null);
    if (confirmedHistory.length < 20) return { isStable: true, reason: "Not enough confirmed results.", details: `Confirmed: ${confirmedHistory.length}`, dominance: "NONE" };
    const recentResults = confirmedHistory.slice(0, 20).map(p => getBigSmallType(p.actual)).filter(r => r);
    if (recentResults.length < 18) return { isStable: true, reason: "Not enough valid B/S for stability.", details: `Valid B/S: ${recentResults.length}`, dominance: "NONE" };
    const bigCount = recentResults.filter(r => r === "BIG").length;
    const smallCount = recentResults.filter(r => r === "SMALL").length;
    let outcomeDominance = "NONE";
    if (bigCount / recentResults.length >= 0.85) {
        outcomeDominance = "BIG_DOMINANCE";
        return { isStable: false, reason: "Unstable: Extreme Outcome Dominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }
    if (smallCount / recentResults.length >= 0.85) {
        outcomeDominance = "SMALL_DOMINANCE";
        return { isStable: false, reason: "Unstable: Extreme Outcome Dominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }
    const entropy = calculateEntropyForSignal(recentResults, recentResults.length);
    if (entropy !== null && entropy < 0.40) {
        return { isStable: false, reason: "Unstable: Very Low Entropy (Highly Predictable/Stuck)", details: `Entropy: ${entropy.toFixed(2)}`, dominance: outcomeDominance };
    }
    const actualNumbersRecent = confirmedHistory.slice(0, 15).map(p => parseInt(p.actual)).filter(n => !isNaN(n));
    if (actualNumbersRecent.length >= 10) {
        const stdDevNum = calculateStdDev(actualNumbersRecent, actualNumbersRecent.length);
        if (stdDevNum !== null && stdDevNum > 3.4) {
            return { isStable: false, reason: "Unstable: High Numerical Volatility", details: `StdDev: ${stdDevNum.toFixed(2)}`, dominance: outcomeDominance };
        }
    }
    let alternations = 0;
    for (let i = 0; i < recentResults.length - 1; i++) {
        if (recentResults[i] !== recentResults[i + 1]) alternations++;
    }
    if (alternations / (recentResults.length - 1) > 0.80) {
        return { isStable: false, reason: "Unstable: Excessive Choppiness", details: `Alternations: ${alternations}/${recentResults.length}`, dominance: outcomeDominance };
    }
    return { isStable: true, reason: "Trend appears stable.", details: `Entropy: ${entropy !== null ? entropy.toFixed(2) : 'N/A'}`, dominance: outcomeDominance };
}

function analyzeVolatilityTrendFusion(trendContext, marketEntropyState) {
    const { direction, strength, volatility } = trendContext;
    const { state: entropy } = marketEntropyState;
    let prediction = null;
    let confidence = 0;
    if (strength === 'STRONG' && (volatility === 'LOW' || volatility === 'MEDIUM') && entropy === 'ORDERLY') {
        prediction = direction.includes('BIG') ? 'BIG' : 'SMALL';
        confidence = 80;
    }
    else if (strength === 'STRONG' && volatility === 'HIGH' && entropy.includes('CHAOS')) {
        prediction = direction.includes('BIG') ? 'SMALL' : 'BIG';
        confidence = 70;
    }
    else if (strength === 'RANGING' && volatility === 'LOW' && entropy === 'ORDERLY') {
        const currentHour = getCurrentISTHour().raw;
        prediction = (currentHour % 2 === 0) ? 'BIG' : 'SMALL';
        confidence = 60;
    }
    if (prediction) {
        return { prediction, confidence };
    }
    return null;
}

// --- Dynamic Weighting, Performance Tracking & Meta-Learning ---
function updateSignalPerformance(actualOutcome, predictedOutcome, periodFull, currentVolatilityRegime, lastFinalConfidence, concentrationModeActive, marketEntropyState, macroRegime) {
    if (!actualOutcome || !predictedOutcome) return;
    const isSystemPredictionCorrect = (predictedOutcome === actualOutcome);
    const isHighConfidencePrediction = lastFinalConfidence > 75;
    const currentRegimeProfile = REGIME_SIGNAL_PROFILES[macroRegime] || REGIME_SIGNAL_PROFILES["DEFAULT"];
    const allPossibleSignalSources = Object.keys(defaultHeuristicPerformance);
    allPossibleSignalSources.forEach(source => {
        let signalType = 'other';
        if (source.includes('_LHT')) signalType = source.split('_')[0].toLowerCase();
        else if (source.includes('_TX')) signalType = source.split('-')[0].toLowerCase();
        if (source.includes('Ichimoku')) signalType = 'ichimoku';
        if (source.includes('Vol-Trend-Fusion')) signalType = 'fusion';
        if (source.includes('RSI')) signalType = 'rsi';
        if (source.includes('Stochastic')) signalType = 'stochastic';
        const isActiveForRegime = currentRegimeProfile.activeSignalTypes.includes('all') || currentRegimeProfile.activeSignalTypes.includes(signalType);
        if (!isActiveForRegime) {
            return;
        }
        if (!signalPerformance[source]) {
            signalPerformance[source] = {
                correct: 0, total: 0, recentAccuracy: [],
                sessionCorrect: 0, sessionTotal: 0,
                lastUpdatePeriod: null, lastActivePeriod: null,
                currentAdjustmentFactor: 1.0, alphaFactor: 1.0, longTermImportanceScore: 0.5,
                performanceByVolatility: {}, isOnProbation: false
            };
        }
        if (!signalPerformance[source].performanceByVolatility[currentVolatilityRegime]) {
            signalPerformance[source].performanceByVolatility[currentVolatilityRegime] = { correct: 0, total: 0 };
        }
        if (signalPerformance[source].lastUpdatePeriod !== periodFull) {
            signalPerformance[source].total++;
            signalPerformance[source].sessionTotal++;
            signalPerformance[source].performanceByVolatility[currentVolatilityRegime].total++;
            let outcomeCorrect = isSystemPredictionCorrect ? 1 : 0;
            if (outcomeCorrect) {
                signalPerformance[source].correct++;
                signalPerformance[source].sessionCorrect++;
                signalPerformance[source].performanceByVolatility[currentVolatilityRegime].correct++;
            }
            let importanceDelta = 0;
            if(outcomeCorrect) {
                importanceDelta = isHighConfidencePrediction ? 0.05 : 0.025;
            } else {
                importanceDelta = isHighConfidencePrediction ? -0.07 : -0.04;
            }
            if (concentrationModeActive || marketEntropyState.includes("CHAOS")) {
                importanceDelta *= 1.5;
            }
            signalPerformance[source].longTermImportanceScore = Math.min(1.0, Math.max(0.0, signalPerformance[source].longTermImportanceScore + importanceDelta));
            signalPerformance[source].recentAccuracy.push(outcomeCorrect);
            if (signalPerformance[source].recentAccuracy.length > PERFORMANCE_WINDOW) {
                signalPerformance[source].recentAccuracy.shift();
            }
            if (signalPerformance[source].total >= MIN_OBSERVATIONS_FOR_ADJUST && signalPerformance[source].recentAccuracy.length >= PERFORMANCE_WINDOW / 2) {
                const recentCorrectCount = signalPerformance[source].recentAccuracy.reduce((sum, acc) => sum + acc, 0);
                const accuracy = recentCorrectCount / signalPerformance[source].recentAccuracy.length;
                const deviation = accuracy - 0.5;
                let newAdjustmentFactor = 1 + (deviation * 5.0);
                newAdjustmentFactor = Math.min(Math.max(newAdjustmentFactor, MIN_WEIGHT_FACTOR), MAX_WEIGHT_FACTOR);
                signalPerformance[source].currentAdjustmentFactor = newAdjustmentFactor;
                if (signalPerformance[source].recentAccuracy.length >= PROBATION_MIN_OBSERVATIONS && accuracy < PROBATION_THRESHOLD_ACCURACY) {
                    signalPerformance[source].isOnProbation = true;
                } else if (accuracy > PROBATION_THRESHOLD_ACCURACY + 0.15) {
                    signalPerformance[source].isOnProbation = false;
                }
                let alphaLearningRate = ALPHA_UPDATE_RATE * 1.2;
                if (accuracy < 0.35) alphaLearningRate *= 1.8;
                else if (accuracy < 0.45) alphaLearningRate *= 1.5;
                if (newAdjustmentFactor > signalPerformance[source].alphaFactor) {
                    signalPerformance[source].alphaFactor = Math.min(MAX_ALPHA_FACTOR, signalPerformance[source].alphaFactor + alphaLearningRate * (newAdjustmentFactor - signalPerformance[source].alphaFactor));
                } else {
                    signalPerformance[source].alphaFactor = Math.max(MIN_ALPHA_FACTOR, signalPerformance[source].alphaFactor - alphaLearningRate * (signalPerformance[source].alphaFactor - newAdjustmentFactor));
                }
            }
            signalPerformance[source].lastUpdatePeriod = periodFull;
            signalPerformance[source].lastActivePeriod = periodFull;
        }
    });
}

function updateQLearningState(history, lastPredictedOutcome, actualOutcome) {
    const outcomes = history.map(p => getBigSmallType(p.actual)).filter(Boolean);
    if (outcomes.length < 5) return;
    const prevState = outcomes.slice(1, 5).join('-');
    const currentAction = lastPredictedOutcome;
    const newState = outcomes.slice(0, 4).join('-');
    const reward = (actualOutcome === lastPredictedOutcome) ? Q_REWARD_WIN : Q_REWARD_LOSS;
    if (!qTable[prevState]) {
        qTable[prevState] = { BIG: 0, SMALL: 0 };
    }
    if (!qTable[newState]) {
        qTable[newState] = { BIG: 0, SMALL: 0 };
    }
    const currentQ = qTable[prevState][currentAction] || 0;
    const maxNextQ = Math.max(qTable[newState].BIG || 0, qTable[newState].SMALL || 0);
    const target = reward + Q_DISCOUNT_FACTOR * maxNextQ;
    const delta = target - currentQ;
    qTable[prevState][currentAction] = currentQ + Q_LEARNING_RATE * delta;
    const stateTotal = Math.abs(qTable[prevState].BIG) + Math.abs(qTable[prevState].SMALL);
    if (stateTotal > 0) {
        qTable[prevState].BIG /= stateTotal;
        qTable[prevState].SMALL /= stateTotal;
    }
}

function detectConceptDrift(isCorrect) {
    const error = isCorrect ? 0 : 1;
    driftDetector.recentErrors.push(error);
    if (driftDetector.recentErrors.length > 50) {
        driftDetector.recentErrors.shift();
    }
    if (driftDetector.recentErrors.length === 0) {
        return 'STABLE';
    }
    if (driftDetector.ewma === 0.5 && driftDetector.recentErrors.length > 0) {
        const initialSum = driftDetector.recentErrors.reduce((a, b) => a + b, 0);
        driftDetector.ewma = initialSum / driftDetector.recentErrors.length;
    } else {
        driftDetector.ewma = (driftDetector.lambda * error) + (1 - driftDetector.lambda) * driftDetector.ewma;
    }
    const deviation = Math.abs(driftDetector.ewma - driftDetector.baselineError);
    if (deviation > driftDetector.driftThreshold) {
        driftDetector.ewma = driftDetector.baselineError;
        return 'DRIFT';
    } else if (deviation > driftDetector.warningThreshold) {
        return 'WARNING';
    } else {
        return 'STABLE';
    }
}

function updateRegimeProfilePerformance(regime, actualOutcome, predictedOutcome) {
    if (REGIME_SIGNAL_PROFILES[regime] && predictedOutcome) {
        const profile = REGIME_SIGNAL_PROFILES[regime];
        profile.totalPredictions = (profile.totalPredictions || 0) + 1;
        let outcomeCorrect = (actualOutcome === predictedOutcome) ? 1 : 0;
        if(outcomeCorrect === 1) profile.correctPredictions = (profile.correctPredictions || 0) + 1;
        profile.recentAccuracy.push(outcomeCorrect);
        if (profile.recentAccuracy.length > REGIME_ACCURACY_WINDOW) {
            profile.recentAccuracy.shift();
        }
        if (profile.recentAccuracy.length >= REGIME_ACCURACY_WINDOW * 0.7) {
            const regimeAcc = profile.recentAccuracy.reduce((a,b) => a+b, 0) / profile.recentAccuracy.length;
            let dynamicLearningRateFactor = 1.0 + Math.abs(0.5 - GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE) * 0.7;
            dynamicLearningRateFactor = Math.max(0.65, Math.min(1.5, dynamicLearningRateFactor));
            let currentLearningRate = REGIME_LEARNING_RATE_BASE * dynamicLearningRateFactor;
            currentLearningRate = Math.max(0.01, Math.min(0.07, currentLearningRate));
            if (regimeAcc > 0.62) {
                profile.baseWeightMultiplier = Math.min(1.9, profile.baseWeightMultiplier + currentLearningRate);
                profile.contextualAggression = Math.min(1.8, profile.contextualAggression + currentLearningRate * 0.5);
            } else if (regimeAcc < 0.38) {
                profile.baseWeightMultiplier = Math.max(0.20, profile.baseWeightMultiplier - currentLearningRate * 1.3);
                profile.contextualAggression = Math.max(0.30, profile.contextualAggression - currentLearningRate * 0.7);
            }
        }
    }
}

function analyzeSignalConsistency(signals) {
    if (!signals || signals.length < 3) return { score: 0.70, details: "Too few signals for consistency check" };
    const validSignals = signals.filter(s => s.prediction);
    if (validSignals.length < 3) return { score: 0.70, details: "Too few valid signals" };
    const predictions = { BIG: 0, SMALL: 0 };
    validSignals.forEach(s => {
        if (s.prediction === "BIG" || s.prediction === "SMALL") predictions[s.prediction]++;
    });
    const totalPredictions = predictions.BIG + predictions.SMALL;
    if (totalPredictions === 0) return { score: 0.5, details: "No directional signals" };
    const consistencyScore = Math.max(predictions.BIG, predictions.SMALL) / totalPredictions;
    return { score: consistencyScore, details: `Overall split B:${predictions.BIG}/S:${predictions.SMALL}` };
}

function analyzePathConfluenceStrength(activeSignals, finalPrediction) {
    if (!activeSignals || activeSignals.length === 0 || !finalPrediction) return { score: 0, diversePaths: 0, details: "No valid signals or prediction." };
    const signalCategories = new Set();
    activeSignals.forEach(s => {
        const sourceName = s.source;
        if (sourceName.includes("Ichimoku") || sourceName.includes("trend") || sourceName.includes("ARIMA")) signalCategories.add('trend');
        else if (sourceName.includes("Stochastic") || sourceName.includes("RSI") || sourceName.includes("momentum")) signalCategories.add('momentum');
        else if (sourceName.includes("balance") || sourceName.includes("deviation") || sourceName.includes("meanRev")) signalCategories.add('meanRev');
        else if (sourceName.includes("Pattern") || sourceName.includes("oscillation") || sourceName.includes("microTrend")) signalCategories.add('pattern');
        else if (sourceName.includes("Vol") || sourceName.includes("entropy") || sourceName.includes("Fusion")) signalCategories.add('volatility');
        else if (sourceName.includes("Q-Learning") || sourceName.includes("Numerology") || sourceName.includes("Bayesian")) signalCategories.add('adaptive');
        else signalCategories.add('other');
    });
    const diversePathCount = signalCategories.size;
    let confluenceScore = 0;
    if (diversePathCount >= 4) confluenceScore = 0.20;
    else if (diversePathCount === 3) confluenceScore = 0.12;
    else if (diversePathCount === 2) confluenceScore = 0.05;
    return { score: Math.min(confluenceScore, 0.30), diversePaths: diversePathCount, details: `Paths:${diversePathCount}` };
}

function checkForAnomalousPerformance(currentSharedStats) {
    if (reflexiveCorrectionActive > 0) {
        reflexiveCorrectionActive--;
        return true;
    }
    if (currentSharedStats && typeof currentSharedStats.lastFinalConfidence === 'number' && currentSharedStats.lastActualOutcome !== null && typeof currentSharedStats.lastPredictedOutcome !== 'undefined') {
        const lastActualType = getBigSmallType(currentSharedStats.lastActualOutcome);
        const lastPredWasCorrect = lastActualType === currentSharedStats.lastPredictedOutcome;
        const lastPredWasHighConf = currentSharedStats.lastConfidenceLevel === 3;
        if (lastPredWasHighConf && !lastPredWasCorrect) {
            consecutiveHighConfLosses++;
        } else {
            consecutiveHighConfLosses = 0;
        }
    }
    if (consecutiveHighConfLosses >= 2) {
        reflexiveCorrectionActive = 5;
        consecutiveHighConfLosses = 0;
        return true;
    }
    return false;
}

function calculateUncertaintyScore(trendContext, stability, marketEntropyState, signalConsistency, pathConfluence, globalAccuracy, isReflexiveCorrection, driftState) {
    let uncertaintyScore = 0;
    let reasons = [];
    if (isReflexiveCorrection) {
        uncertaintyScore += 65;
        reasons.push("ReflexiveCorrection");
    }
    if(driftState === 'DRIFT') {
        uncertaintyScore += 60;
        reasons.push("ConceptDrift");
    } else if (driftState === 'WARNING') {
        uncertaintyScore += 30;
        reasons.push("DriftWarning");
    }
    if (!stability.isStable) {
        uncertaintyScore += (stability.reason.includes("Dominance") || stability.reason.includes("Choppiness")) ? 40 : 30;
        reasons.push(`Instability:${stability.reason}`);
    }
    if (marketEntropyState.state.includes("CHAOS")) {
        uncertaintyScore += marketEntropyState.state === "RISING_CHAOS" ? 35 : 25;
        reasons.push(marketEntropyState.state);
    }
    if (signalConsistency.score < 0.65) {
        uncertaintyScore += (1 - signalConsistency.score) * 40;
        reasons.push(`LowConsistency:${signalConsistency.score.toFixed(2)}`);
    }
    if (pathConfluence.diversePaths < 3) {
        uncertaintyScore += (3 - pathConfluence.diversePaths) * 10;
        reasons.push(`LowConfluence:${pathConfluence.diversePaths}`);
    }
    if (trendContext.isTransitioning) {
        uncertaintyScore += 20;
        reasons.push("RegimeTransition");
    }
    if (trendContext.volatility === "HIGH") {
        uncertaintyScore += 15;
        reasons.push("HighVolatility");
    }
    if (typeof globalAccuracy === 'number' && globalAccuracy < 0.48) {
        uncertaintyScore += (0.48 - globalAccuracy) * 120;
        reasons.push(`LowGlobalAcc:${globalAccuracy.toFixed(2)}`);
    }
    return { score: uncertaintyScore, reasons: reasons.join(';') };
}

function checkPerformanceAndSetMode(history) {
    const recentHistory = history.filter(p => p.status === 'win' || p.status === 'loss').slice(0, 20);
    if (recentHistory.length < 15) {
        engineMode = "NORMAL";
        GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = 0.5;
        return;
    }
    const wins = recentHistory.filter(p => p.status === 'win').length;
    const winRate = wins / recentHistory.length;
    GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = winRate;
    if (winRate < 0.35 && engineMode === "NORMAL") {
        console.log(`[MODE_SWITCH] Win rate dropped to ${(winRate * 100).toFixed(1)}%. Switching to CONTRARIAN mode.`);
        engineMode = "CONTRARIAN";
    } else if (winRate > 0.50 && engineMode === "CONTRARIAN") {
        console.log(`[MODE_SWITCH] Win rate recovered to ${(winRate * 100).toFixed(1)}%. Switching back to NORMAL mode.`);
        engineMode = "NORMAL";
    }
}

// --- Main Prediction Cycle & Logic ---
async function processPredictionCycle(gameData, currentHistoryData, lastProcessedPeriodId) {
    loadPredictionEngineState();
    console.log("\n--- Starting New Prediction Cycle ---");
    if (!gameData || !gameData.issueNumber || !gameData.number) {
        console.warn("Invalid game data received from API. Skipping prediction cycle update.");
        return null;
    }
    const currentPeriodFull = String(gameData.issueNumber);
    const actualNumber = parseInt(String(gameData.number), 10);
    const actualType = getBigSmallType(actualNumber);
    let tempHistory = JSON.parse(JSON.stringify(currentHistoryData));
    let currentSharedStatsForNextPrediction = {};
    let resolvedThisCycle = false;
    const entryToUpdateIndex = tempHistory.findIndex(item =>
        item.periodFull === currentPeriodFull && item.status === 'pending'
    );
    if (entryToUpdateIndex !== -1) {
        const entryToUpdate = tempHistory[entryToUpdateIndex];
        entryToUpdate.actual = actualNumber;
        entryToUpdate.actualType = actualType;
        const mainPredictionWins = entryToUpdate.prediction === actualType;
        if (mainPredictionWins) {
            entryToUpdate.status = 'win';
            systemConsecutiveLosses = 0;
        } else {
            entryToUpdate.status = 'loss';
            systemConsecutiveLosses++;
        }
        console.log(`Resolved history for period ${currentPeriodFull}: Status ${entryToUpdate.status}. AI Predicted: ${entryToUpdate.prediction}, Actual: ${actualType} (${actualNumber}).`);
        currentSharedStatsForNextPrediction = {
            lastActualOutcome: actualNumber,
            lastPredictedOutcome: entryToUpdate.prediction,
            lastFinalConfidence: entryToUpdate.confidence,
            lastConfidenceLevel: (entryToUpdate.confidence > 75) ? 3 : (entryToUpdate.confidence > 62 ? 2 : 1),
            lastMacroRegime: entryToUpdate.macroRegime,
            lastConcentrationModeEngaged: entryToUpdate.concentrationModeEngaged,
            lastMarketEntropyState: entryToUpdate.marketEntropyState,
            lastVolatilityRegime: entryToUpdate.lastVolatilityRegime,
            lastPeriodFull: currentPeriodFull,
            longTermGlobalAccuracy: GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE
        };
        const confirmedHistory = tempHistory.filter(h => h.actual !== null && h.status !== 'pending' && h.status !== 'skipped');
        updateSignalPerformance(
            actualType,
            entryToUpdate.prediction,
            currentPeriodFull,
            entryToUpdate.lastVolatilityRegime || 'UNKNOWN',
            entryToUpdate.confidence,
            entryToUpdate.concentrationModeEngaged || false,
            entryToUpdate.marketEntropyState || 'STABLE_MODERATE',
            entryToUpdate.macroRegime || 'DEFAULT'
        );
        updateQLearningState(confirmedHistory, entryToUpdate.prediction, actualType);
        if (entryToUpdate.macroRegime) {
            updateRegimeProfilePerformance(entryToUpdate.macroRegime, actualType, entryToUpdate.prediction);
        }
        checkPerformanceAndSetMode(tempHistory);
        const isOverallPredictionCorrect = (entryToUpdate.prediction === actualType);
        currentSharedStatsForNextPrediction.driftState = detectConceptDrift(isOverallPredictionCorrect);
        resolvedThisCycle = true;
    } else {
        console.warn(`No pending history entry found for resolved period: ${currentPeriodFull}. Adding it as 'skipped'.`);
        const isNewResolvedGame = !tempHistory.some(item => item.periodFull === currentPeriodFull);
        if (isNewResolvedGame) {
            tempHistory.unshift({
                periodFull: currentPeriodFull,
                periodDisplay: currentPeriodFull.slice(-5),
                prediction: actualType,
                number: actualNumber,
                actual: actualNumber,
                actualType: actualType,
                status: 'skipped',
                timestamp: Date.now(),
                confidence: 50,
                rationale: "History entry added retroactively (no prior pending prediction)."
            });
            console.log(`Added resolved period ${currentPeriodFull} as 'skipped' to history.`);
        }
    }
    const nextPeriodFull = (BigInt(currentPeriodFull) + 1n).toString();
    const { prediction: newAiPrediction, number: nextPredictedNumber, finalConfidence: newConfidence, overallLogic: newRationale, contributingSignals: newContributingSignals, currentMacroRegime: newMacroRegime, marketEntropyState: newMarketEntropyState, concentrationModeEngaged: newConcentrationModeEngaged, lastVolatilityRegime: newVolatilityRegime, predictionQualityScore: newPQS }
        = await generateNewPrediction(tempHistory, systemConsecutiveLosses, nextPeriodFull, currentSharedStatsForNextPrediction);
    const existingPendingNextPeriodEntry = tempHistory.find(item =>
        item.periodFull === nextPeriodFull && item.status === 'pending'
    );
    if (existingPendingNextPeriodEntry) {
        existingPendingNextPeriodEntry.prediction = newAiPrediction;
        existingPendingNextPeriodEntry.number = nextPredictedNumber;
        existingPendingNextPeriodEntry.confidence = newConfidence;
        existingPendingNextPeriodEntry.rationale = newRationale;
        existingPendingNextPeriodEntry.contributingSignals = newContributingSignals;
        existingPendingNextPeriodEntry.macroRegime = newMacroRegime;
        existingPendingNextPeriodEntry.marketEntropyState = newMarketEntropyState;
        existingPendingNextPeriodEntry.concentrationModeEngaged = newConcentrationModeEngaged;
        existingPendingNextPeriodEntry.lastVolatilityRegime = newVolatilityRegime;
        existingPendingNextPeriodEntry.predictionQualityScore = newPQS;
        console.log(`Updated existing pending prediction for period ${nextPeriodFull}.`);
    } else {
        tempHistory.unshift({
            periodFull: nextPeriodFull,
            periodDisplay: nextPeriodFull.slice(-5),
            prediction: newAiPrediction,
            number: nextPredictedNumber,
            confidence: newConfidence,
            actual: null,
            status: 'pending',
            timestamp: Date.now(),
            rationale: newRationale,
            contributingSignals: newContributingSignals,
            macroRegime: newMacroRegime,
            marketEntropyState: newMarketEntropyState,
            concentrationModeEngaged: newConcentrationModeEngaged,
            lastVolatilityRegime: newVolatilityRegime,
            predictionQualityScore: newPQS
        });
        console.log(`Added new pending prediction for period ${nextPeriodFull}.`);
    }
    if (tempHistory.length > 200) {
        tempHistory = tempHistory.slice(0, 200);
    }
    savePredictionEngineState();
    return {
        updatedHistoryData: tempHistory,
        updatedSystemLosses: systemConsecutiveLosses,
        nextPeriodPrediction: newAiPrediction,
        nextPeriodPredictedNumber: nextPredictedNumber,
        nextPeriodConfidence: newConfidence,
        lastProcessedPeriodId: currentPeriodFull,
        rationale: newRationale
    };
}

async function generateNewPrediction(history, currentSystemLosses, nextPeriodFull, currentSharedStats) {
    console.log(`Refined Supercore vCombined Initializing Prediction for period ${nextPeriodFull}. MODE: ${engineMode}`);
    let masterLogic = [`RScore_Combined(M:${engineMode})`];
    const time = getCurrentISTHour();
    const primeTimeSession = getPrimeTimeSession(time.raw);
    let primeTimeAggression = 1.0;
    let primeTimeConfidence = 1.0;
    if (primeTimeSession) {
        masterLogic.push(`!!! PRIME TIME ACTIVE: ${primeTimeSession.session} !!!`);
        primeTimeAggression = primeTimeSession.aggression;
        primeTimeConfidence = primeTimeSession.confidence;
    }
    const isReflexiveCorrection = checkForAnomalousPerformance(currentSharedStats);
    if (isReflexiveCorrection) {
        masterLogic.push(`!!! REFLEXIVE CORRECTION ACTIVE !!! (Countdown: ${reflexiveCorrectionActive})`);
    }
    const confirmedHistory = history.filter(p => p && p.actual !== null && typeof p.actual !== 'undefined');
    if (confirmedHistory.length < 25) {
        masterLogic.push(`InsufficientHistory_ForceDeterministicDefault`);
        const finalDecision = (BigInt(nextPeriodFull) % 2n === 0n) ? "BIG" : "SMALL";
        const predictedNumber = finalDecision === 'BIG' ? Math.floor(mulberry32(parseInt(nextPeriodFull.slice(-6)) + 5)() * 5) + 5 : Math.floor(mulberry32(parseInt(nextPeriodFull.slice(-6)))() * 5);
        return {
             prediction: finalDecision, number: predictedNumber, finalDecision: finalDecision, finalConfidence: 50, confidenceLevel: 1, isForcedPrediction: true,
             overallLogic: masterLogic.join(' -> '), source: "InsufficientHistory", contributingSignals: [], currentMacroRegime: 'UNKNOWN_REGIME',
             concentrationModeEngaged: false, predictionQualityScore: 0.01,
             lastPredictedOutcome: finalDecision, lastFinalConfidence: 50,
             lastConfidenceLevel: 1, lastMacroRegime: 'UNKNOWN_REGIME', lastPredictionSignals: [], lastConcentrationModeEngaged: false,
             lastMarketEntropyState: 'UNCERTAIN_ENTROPY', lastVolatilityRegime: 'UNKNOWN',
             periodFull: nextPeriodFull
        };
    }
    const trendContext = getMarketRegimeAndTrendContext(confirmedHistory);
    masterLogic.push(`TrendCtx(Dir:${trendContext.direction},Str:${trendContext.strength},Vol:${trendContext.volatility},Regime:${trendContext.macroRegime})`);
    const stability = analyzeTrendStability(confirmedHistory);
    const marketEntropyAnalysis = analyzeMarketEntropyState(confirmedHistory, trendContext, stability);
    masterLogic.push(`MarketEntropy:${marketEntropyAnalysis.state}`);
    let concentrationModeEngaged = !stability.isStable || isReflexiveCorrection || marketEntropyAnalysis.state.includes("CHAOS");
    let driftState = currentSharedStats?.driftState || 'STABLE';
    if (driftState !== 'STABLE') {
        masterLogic.push(`!!! DRIFT DETECTED: ${driftState} !!!`);
        concentrationModeEngaged = true;
    }
    if (concentrationModeEngaged) masterLogic.push(`ConcentrationModeActive`);
    const currentVolatilityRegimeForPerf = trendContext.volatility;
    const currentMacroRegime = trendContext.macroRegime;
    const currentRegimeProfile = REGIME_SIGNAL_PROFILES[currentMacroRegime] || REGIME_SIGNAL_PROFILES["DEFAULT"];
    const recentNumbersSummary = confirmedHistory.slice(0, 10).map(h => `${h.periodDisplay}:${getBigSmallType(h.actual)}`).join(', ');
    const overallOutcomeCounts = { BIG: 0, SMALL: 0 };
    confirmedHistory.slice(0, 50).forEach(h => {
        const type = getBigSmallType(h.actual);
        if (type) overallOutcomeCounts[type]++;
    });
    const overallBias = overallOutcomeCounts.BIG > overallOutcomeCounts.SMALL ? "BIG biased" : (overallOutcomeCounts.SMALL > overallOutcomeCounts.BIG ? "SMALL biased" : "balanced");
    const signalPerformanceSummary = Object.entries(signalPerformance)
        .filter(([source, perf]) => perf.total >= MIN_OBSERVATIONS_FOR_ADJUST)
        .map(([source, perf]) => {
            const accuracy = perf.total > 0 ? (perf.correct / perf.total) * 100 : 0;
            const probationStatus = perf.isOnProbation ? ' (ON PROBATION)' : '';
            const currentAdj = perf.currentAdjustmentFactor.toFixed(2);
            const longTermImp = perf.longTermImportanceScore.toFixed(2);
            return `${source}: Acc=${accuracy.toFixed(1)}%, AdjFactor=${currentAdj}, ImpScore=${longTermImp}${probationStatus}`;
        }).join('\n');
    let qTableInsight = "No specific Q-table insights.";
    const qLearningInsight = getQLearningInsight(confirmedHistory);
    if (qLearningInsight) {
        const qv = qLearningInsight.qValues;
        if (qv.BIG > qv.SMALL) {
            qTableInsight = `Q-Learning favors BIG (Q_BIG:${qv.BIG.toFixed(2)}, Q_SMALL:${qv.SMALL.toFixed(2)}) for state '${qLearningInsight.state}'.`;
        } else if (qv.SMALL > qv.BIG) {
            qTableInsight = `Q-Learning favors SMALL (Q_BIG:${qv.BIG.toFixed(2)}, Q_SMALL:${qv.SMALL.toFixed(2)}) for state '${qLearningInsight.state}'.`;
        } else {
            qTableInsight = `Q-Learning is neutral for state '${qLearningInsight.state}'.`;
        }
    }
    const ichimokuResult = analyzeIchimokuCloud(confirmedHistory, 9, 26, 52);
    const rsiValue = calculateRSI(confirmedHistory.map(h => h.actual), 14);
    const stochasticValue = calculateStochastic(confirmedHistory.map(h => h.actual), 14, 3);
    const volTrendFusionResult = analyzeVolatilityTrendFusion(trendContext, marketEntropyAnalysis);
    const numerologyResult = analyzePeriodNumerology(nextPeriodFull);
    const arimaResult = analyzeARIMA(confirmedHistory);
    const lstmPatternResult = analyzeLSTMPattern(confirmedHistory);
    let specificSignalInsights = [];
    if (ichimokuResult) specificSignalInsights.push(`Ichimoku Cloud: ${ichimokuResult.summary}`);
    if (rsiValue !== null) specificSignalInsights.push(`RSI(14): ${rsiValue.toFixed(2)} (Overbought>70, Oversold<30)`);
    if (stochasticValue !== null) specificSignalInsights.push(`Stochastic(%K:${stochasticValue.k.toFixed(2)}, %D:${stochasticValue.d.toFixed(2)}) (Overbought>80, Oversold<20)`);
    if (volTrendFusionResult) specificSignalInsights.push(`Vol-Trend-Fusion: Predicted ${volTrendFusionResult.prediction} with ${volTrendFusionResult.confidence.toFixed(1)}% confidence.`);
    if (numerologyResult) specificSignalInsights.push(`Period Numerology: Predicted ${numerologyResult.prediction} with ${numerologyResult.confidence.toFixed(1)}% confidence.`);
    if (arimaResult) specificSignalInsights.push(`Simplified ARIMA: Predicted ${arimaResult.prediction} with ${arimaResult.confidence.toFixed(1)}% confidence.`);
    if (lstmPatternResult) specificSignalInsights.push(`Simplified LSTM Pattern: Predicted ${lstmPatternResult.prediction} with ${lstmPatternResult.confidence.toFixed(1)}% confidence.`);
    const prompt = `
You are the "Combined Prediction Engine - Head Agent". Your task is to analyze various market context signals, historical data, and performance metrics to make an accurate prediction ("BIG" or "SMALL") for the next period, along with a confidence score and a predicted number (0-9). You are acting as the central intelligence integrating insights from various "sub-systems" and "tools."

**Current Request:**
- Predict for next period: ${nextPeriodFull}

**Market & System State:**
- **Recent History (last 10 actual outcomes - Period:Type):** ${recentNumbersSummary}
- **Overall History Bias (last 50 periods):** The market has recently shown a ${overallBias} bias.
- **Consecutive System Losses:** ${currentSystemLosses} (If > 0, system is in a loss streak. Prioritize recovery if high.)
- **Reflexive Correction Active:** ${isReflexiveCorrection ? 'YES (Forced adjustment active for crisis recovery - consider aggressive counter-trend)' : 'NO'}
- **Engine Mode:** ${engineMode} (If 'CONTRARIAN', you should consider inverting your most likely prediction based on consensus.)
- **Concept Drift State:** ${driftState} (If 'WARNING' or 'DRIFT', indicate increased uncertainty and caution. Prefer conservative or opposite predictions.)

**Detailed Market Environment Analysis:**
- **Trend Context:**
    - Strength: ${trendContext.strength} (e.g., STRONG, MODERATE, RANGING, WEAK)
    - Direction: ${trendContext.direction} (e.g., BIG, SMALL, NONE - current trend direction)
    - Volatility: ${trendContext.volatility} (e.g., HIGH, MEDIUM, LOW, VERY_LOW - how much movement)
    - Macro Regime: ${currentMacroRegime} (e.g., TREND_STRONG_LOW_VOL, RANGE_HIGH_VOL - overarching market state)
    - Is Transitioning: ${trendContext.isTransitioning ? 'YES (Market might be changing regime, increased uncertainty)' : 'NO'}
- **Market Stability:**
    - Stable: ${stability.isStable ? 'YES (Predictability likely higher)' : 'NO'}
    - Reason for Instability: ${stability.isStable ? 'N/A' : stability.reason}
    - Dominance: ${stability.dominance} (e.g., BIG_DOMINANCE if BIG has occurred too frequently)
- **Market Entropy State:** ${marketEntropyAnalysis.state} (e.g., ORDERLY, STABLE_CHAOS, RISING_CHAOS, SUBSIDING_CHAOS - how random/predictable outcomes are)
- **Concentration Mode Engaged:** ${concentrationModeEngaged ? 'YES (High alert, focus on highly robust signals, consider reduced aggression)' : 'NO'}
- **Prime Time Session:** ${primeTimeSession ? `YES (${primeTimeSession.session}, Potential for increased aggression and confidence: Aggression: ${primeTimeSession.aggression.toFixed(2)}, Confidence Boost: ${primeTimeSession.confidence.toFixed(2)})` : 'NO'}

**Signal & Heuristic Performance Overview (Long-term & Adaptive Feedback for your weighting):**
This section provides you with the performance history of various underlying "signals" or "tools". Use this information to implicitly weight their importance in your decision.
${signalPerformanceSummary.length > 0 ? signalPerformanceSummary : 'No sufficient data yet for individual signal performance analysis.'}

**Specific Signal Insights:**
These are direct insights from various analytical models. Integrate them into your decision.
${specificSignalInsights.length > 0 ? specificSignalInsights.join('\n') : 'No specific insights from advanced signals available yet.'}

**Learned Q-Table Insight:**
${qTableInsight}

**Your Final Task:**
Based on all the above comprehensive information, acting as the intelligent "Head Agent", predict the \`finalDecision\` ("BIG" or "SMALL"), the \`number\` (a single digit from 0-9 that corresponds to your final decision - 0-4 for SMALL, 5-9 for BIG), the \`finalConfidence\` (percentage from 0-100), and a concise \`rationale\` (1-2 sentences explaining your primary reasons).

Consider the following guidance:
- If \`currentSystemLosses\` is > 0 and \`reflexiveCorrectionActive\` is YES, your primary goal is recovery. Strongly consider reversing the last predominant outcome or the system's last losing prediction.
- If \`engineMode\` is 'CONTRARIAN', consider inverting your most likely prediction to exploit market inefficiencies.
- High \`ConcentrationModeEngaged\`, \`DRIFT\` state, or \`RISING_CHAOS\` typically implies increased risk and uncertainty. You might want to make more conservative predictions, or even lean towards the opposite of consensus, or lower confidence.
- \`Prime Time\` sessions might allow for slightly higher confidence or more aggressive predictions.
- Implicitly weigh the various "signals" based on their reported performance (Acc, AdjFactor, ImpScore).
- Ensure the \`number\` you predict falls into the range implied by your \`finalDecision\`. If \`finalDecision\` is "BIG", predict a number from 5-9. If "SMALL", predict 0-4. Make this number selection appear intelligently derived, but ensure it's valid.

Provide your response strictly as a JSON object with the following schema:
\`\`\`json
{
  "finalDecision": "BIG" | "SMALL",
  "number": 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  "finalConfidence": "number (0-100)",
  "rationale": "string"
}
\`\`\`
`;
    let response;
    try {
        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "finalDecision": { "type": "STRING", "enum": ["BIG", "SMALL"] },
                        "number": { "type": "INTEGER", "minimum": 0, "maximum": 9 },
                        "finalConfidence": { "type": "INTEGER", "minimum": 0, "maximum": 100 },
                        "rationale": { "type": "STRING" }
                    },
                    required: ["finalDecision", "number", "finalConfidence", "rationale"]
                }
            }
        };
        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        let parsedLLMResponse;
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            try {
                parsedLLMResponse = JSON.parse(result.candidates[0].content.parts[0].text);
            } catch (jsonError) {
                console.error("Error parsing LLM response JSON:", jsonError);
                console.error("Raw LLM response:", result.candidates[0].content.parts[0].text);
                throw new Error("Failed to parse LLM response as JSON.");
            }
        } else {
            throw new Error("No valid content found in LLM response.");
        }
        let finalDecision = parsedLLMResponse.finalDecision;
        let predictedNumber = parsedLLMResponse.number;
        let finalConfidence = parsedLLMResponse.finalConfidence;
        let rationale = parsedLLMResponse.rationale;
        if (finalDecision === "BIG" && (predictedNumber < 5 || predictedNumber > 9)) {
            console.warn(`LLM predicted BIG but number ${predictedNumber} is out of range. Adjusting to 5.`);
            predictedNumber = 5;
        } else if (finalDecision === "SMALL" && (predictedNumber < 0 || predictedNumber > 4)) {
            console.warn(`LLM predicted SMALL but number ${predictedNumber} is out of range. Adjusting to 0.`);
            predictedNumber = 0;
        }
        finalConfidence = Math.min(100, Math.max(0, finalConfidence));
        let confidenceLevel = 1;
        let highConfThreshold = 75, medConfThreshold = 62;
        if (primeTimeSession) {
            highConfThreshold -= 5; medConfThreshold -= 5;
        }
        if (finalConfidence > medConfThreshold) confidenceLevel = 2;
        if (finalConfidence > highConfThreshold) confidenceLevel = 3;
        const signalConsistency = analyzeSignalConsistency([]);
        const activeSignalSources = Object.keys(signalPerformance).filter(source => {
            const signalType = source.includes('_LHT') ? source.split('_')[0].toLowerCase() : source.split('-')[0].toLowerCase();
            return currentRegimeProfile.activeSignalTypes.includes('all') || currentRegimeProfile.activeSignalTypes.includes(signalType);
        });
        const pathConfluence = analyzePathConfluenceStrength(activeSignalSources.map(s => ({ source: s })), finalDecision);
        const uncertainty = calculateUncertaintyScore(trendContext, stability, marketEntropyAnalysis, signalConsistency, pathConfluence, GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE, isReflexiveCorrection, driftState);
        let pqs = 0.5 + (finalConfidence / 100 - 0.5) * 0.4 + pathConfluence.score * 1.2;
        pqs = Math.max(0.01, Math.min(0.99, pqs - (uncertainty.score / 500)));
        const output = {
            prediction: finalDecision,
            number: predictedNumber,
            finalDecision: finalDecision,
            finalConfidence: finalConfidence,
            confidenceLevel: confidenceLevel,
            isForcedPrediction: isReflexiveCorrection || (uncertainty.score >= (isReflexiveCorrection || driftState === 'DRIFT' ? 85 : 105) || pqs < 0.15),
            overallLogic: masterLogic.join(' -> ') + ` -> LLM_Decision(Conf:${finalConfidence.toFixed(1)}%, Rationale:'${rationale}')`,
            source: "Gemini_Combined_Engine",
            contributingSignals: activeSignalSources.map(s => ({
                source: s,
                prediction: 'LLM_Integrated',
                weight: signalPerformance[s]?.longTermImportanceScore?.toFixed(5) || 'N/A',
                isOnProbation: signalPerformance[s]?.isOnProbation || false
            })).sort((a,b)=>parseFloat(b.weight)-parseFloat(a.weight)).slice(0, 15),
            currentMacroRegime: currentMacroRegime,
            marketEntropyState: marketEntropyAnalysis.state,
            predictionQualityScore: pqs,
            lastPredictedOutcome: finalDecision,
            lastFinalConfidence: finalConfidence,
            lastConfidenceLevel: confidenceLevel,
            lastMacroRegime: currentMacroRegime,
            lastPredictionSignals: activeSignalSources.map(s => ({
                source: s,
                prediction: 'LLM_Integrated',
                weight: signalPerformance[s]?.longTermImportanceScore || 0,
                isOnProbation: signalPerformance[s]?.isOnProbation || false
            })),
            lastConcentrationModeEngaged: concentrationModeEngaged,
            lastMarketEntropyState: marketEntropyAnalysis.state,
            lastVolatilityRegime: trendContext.volatility,
            periodFull: nextPeriodFull
        };
        console.log(`Combined Prediction Engine Output: ${output.finalDecision} - ${output.number} @ ${(output.finalConfidence).toFixed(1)}% | Lvl: ${output.confidenceLevel} | PQS: ${output.predictionQualityScore.toFixed(2)} | Forced: ${output.isForcedPrediction} | Drift: ${driftState}`);
        return output;
    } catch (error) {
        console.error("Error calling Gemini API or processing response:", error);
        masterLogic.push(`LLM_Failed_Fallback_DeterministicDefault`);
        const finalDecision = (BigInt(nextPeriodFull) % 2n === 0n) ? "BIG" : "SMALL";
        const predictedNumber = finalDecision === 'BIG' ? Math.floor(mulberry32(parseInt(nextPeriodFull.slice(-6)) + 5)() * 5) + 5 : Math.floor(mulberry32(parseInt(nextPeriodFull.slice(-6)))() * 5);
        return {
             prediction: finalDecision, number: predictedNumber, finalDecision: finalDecision, finalConfidence: 50, confidenceLevel: 1, isForcedPrediction: true,
             overallLogic: masterLogic.join(' -> ') + ` -> FALLBACK (LLM Error: ${error.message.substring(0, 50)}...)`, source: "LLM_Fallback", contributingSignals: [], currentMacroRegime,
             concentrationModeEngaged, predictionQualityScore: 0.01,
             lastPredictedOutcome: finalDecision, lastFinalConfidence: 50,
             lastConfidenceLevel: 1, lastMacroRegime: currentMacroRegime, lastPredictionSignals: [], lastConcentrationModeEngaged: concentrationModeEngaged,
             lastMarketEntropyState: marketEntropyAnalysis.state, lastVolatilityRegime: trendContext.volatility,
             periodFull: nextPeriodFull
        };
    }
}

// Initial load of state when this script is executed.
loadPredictionEngineState();

module.exports = { processPredictionCycle };
