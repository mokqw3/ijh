// predictionLogic.js - Quantum AI Supercore Engine
// Version: 44.3.0 - Modularized & Enhanced for 10-Engine Architecture
// Changelog v44.3.0:
// - **NEW MODULES**: Implemented 9 specialized analytical "machines" as per user request.
//   - analyzeShortTermTrendPatterns (Shot Trend)
//   - analyzeLongTermTrendPatterns (Long Trend)
//   - detectAnyPattern (General Pattern)
//   - analyzeReversalPatterns (Reversal Patterns)
//   - analyzeAIPoweredLongData (AI-Powered Long Data)
//   - findUniquePatternsAndAnomalies (Unique Patterns & Anomalies)
//   - classifyBigSmallPatterns (Big/Small Patterns)
//   - analyzeRecentJackpotNumbers (Recent Jackpot Numbers)
//   - identifyHardPatterns (Hard Patterns)
// - **INTEGRATION**: The `ultraAIPredict` function (Main Quantum AI Data Processor) now orchestrates and fuses signals from all 9 modules.
// - **REFINEMENT**: Enhanced signal weighting, confidence modeling, and uncertainty quantification to leverage the new diverse signal sources.
// - **Version Bump**: Incremented to v44.3.0 to reflect significant architectural changes.

// --- Helper Functions ---

/**
 * Recursively traverses an object or array and converts `undefined` values to `null`.
 * @param {*} obj The input object or value to sanitize.
 * @returns {*} The sanitized object or value.
 */
function sanitizeForFirebase(obj) {
    if (obj === undefined) {
        return null;
    }
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirebase(item));
    }
    const sanitizedObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            sanitizedObj[key] = sanitizeForFirebase(value);
        }
    }
    return sanitizedObj;
}

/**
 * Determines if a number is "BIG" (5-9) or "SMALL" (0-4).
 * @param {number|string} number The number to classify.
 * @returns {string|null} "BIG", "SMALL", or null if invalid.
 */
function getBigSmallFromNumber(number) {
    if (number === undefined || number === null) return null;
    const num = parseInt(number);
    if (isNaN(num)) return null;
    return num >= 0 && num <= 4 ? 'SMALL' : num >= 5 && num <= 9 ? 'BIG' : null;
}

/**
 * Returns the opposite outcome (BIG/SMALL).
 * @param {string} prediction The current prediction ("BIG" or "SMALL").
 * @returns {string|null} The opposite prediction or null.
 */
function getOppositeOutcome(prediction) {
    return prediction === "BIG" ? "SMALL" : prediction === "SMALL" ? "BIG" : null;
}

/**
 * Calculates Simple Moving Average (SMA).
 * @param {Array<number>} data Numerical data.
 * @param {number} period The period for SMA calculation.
 * @returns {number|null} The SMA value or null.
 */
function calculateSMA(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const relevantData = data.slice(0, period);
    const sum = relevantData.reduce((a, b) => a + b, 0);
    return sum / period;
}

/**
 * Calculates Exponential Moving Average (EMA).
 * @param {Array<number>} data Numerical data.
 * @param {number} period The period for EMA calculation.
 * @returns {number|null} The EMA value or null.
 */
function calculateEMA(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const k = 2 / (period + 1);
    const chronologicalData = data.slice().reverse();

    const initialSliceForSma = chronologicalData.slice(0, period);
    if (initialSliceForSma.length < period) return null;

    let ema = calculateSMA(initialSliceForSma.slice().reverse(), period);
    if (ema === null && initialSliceForSma.length > 0) {
        ema = initialSliceForSma.reduce((a, b) => a + b, 0) / initialSliceForSma.length;
    }
    if (ema === null) return null;

    for (let i = period; i < chronologicalData.length; i++) {
        ema = (chronologicalData[i] * k) + (ema * (1 - k));
    }
    return ema;
}

/**
 * Calculates Standard Deviation.
 * @param {Array<number>} data Numerical data.
 * @param {number} period The period for standard deviation calculation.
 * @returns {number|null} The standard deviation value or null.
 */
function calculateStdDev(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const relevantData = data.slice(0, period);
    if (relevantData.length < 2) return null;
    const mean = relevantData.reduce((a, b) => a + b, 0) / relevantData.length;
    const variance = relevantData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / relevantData.length;
    return Math.sqrt(variance);
}

/**
 * Calculates Relative Strength Index (RSI).
 * @param {Array<number>} data Numerical data.
 * @param {number} period The period for RSI calculation.
 * @returns {number|null} The RSI value or null.
 */
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

/**
 * Gets the current IST hour for time-based contextual analysis.
 * @returns {object} Raw hour, and sin/cos transformed values.
 */
function getCurrentISTHour() {
    try {
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            hour12: false
        });
        const istHourString = istFormatter.formatToParts(now).find(part => part.type === 'hour').value;
        let hour = parseInt(istHourString, 10);
        if (hour === 24) hour = 0; // Midnight 24:00 is 00:00
        return {
            raw: hour,
            sin: Math.sin(hour / 24 * 2 * Math.PI),
            cos: Math.cos(hour / 24 * 2 * Math.PI)
        };
    } catch (error) {
        console.error("Error getting IST hour:", error);
        const hour = new Date().getHours();
        return {
             raw: hour,
             sin: Math.sin(hour / 24 * 2 * Math.PI),
             cos: Math.cos(hour / 24 * 2 * Math.PI)
        };
    }
}

/**
 * Simulates fetching external real-time data for additional context.
 * @returns {object} An object containing a combined factor and reasons.
 */
function getRealTimeExternalData() {
    let combinedFactor = 1.0;
    let reasons = [];

    const weatherConditions = ["Clear", "Clouds", "Haze", "Smoke", "Rain", "Drizzle"];
    const randomWeather = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
    let weatherFactor = 1.0;
    if (["Clear", "Clouds"].includes(randomWeather)) weatherFactor = 1.01;
    else if (["Rain", "Drizzle"].includes(randomWeather)) weatherFactor = 0.99;
    reasons.push(`Weather:${randomWeather}`);
    combinedFactor *= weatherFactor;

    const newsSentiments = ["Positive", "Neutral", "Negative"];
    const randomNewsSentiment = newsSentiments[Math.floor(Math.random() * newsSentiments.length)];
    let newsFactor = 1.0;
    if (randomNewsSentiment === "Positive") newsFactor = 1.02;
    else if (randomNewsSentiment === "Negative") newsFactor = 0.98;
    reasons.push(`News:${randomNewsSentiment}`);
    combinedFactor *= newsFactor;

    const eventRiskLevels = ["None", "Low", "Medium", "High"];
    const randomEventRisk = Math.random() < 0.9 ? eventRiskLevels[0] : eventRiskLevels[Math.floor(Math.random() * 3) + 1];
    let eventFactor = 1.0;
    if (randomEventRisk === "Medium") eventFactor = 0.95;
    else if (randomEventRisk === "High") eventFactor = 0.85;
    reasons.push(`EcoEvent:${randomEventRisk}`);
    combinedFactor *= eventFactor;

    const socialTrends = ["None", "Bullish", "Bearish", "Mixed"];
    const randomSocialTrend = Math.random() < 0.8 ? socialTrends[0] : socialTrends[Math.floor(Math.random() * 3) + 1];
    let socialFactor = 1.0;
    if (randomSocialTrend === "Bullish") socialFactor = 1.03;
    else if (randomSocialTrend === "Bearish") socialFactor = 0.97;
    reasons.push(`Social:${randomSocialTrend}`);
    combinedFactor *= socialFactor;

    return { factor: combinedFactor, reason: `ExtData(${reasons.join(',')})` };
}

/**
 * Identifies prime time sessions based on IST hour.
 * @param {number} istHour Current IST hour.
 * @returns {object|null} Session details or null.
 */
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

// --- Market Context Analysis ---

/**
 * Determines the overall market regime and trend context.
 * @param {Array<object>} history Historical data.
 * @param {number} shortMALookback Short MA period.
 * @param {number} mediumMALookback Medium MA period.
 * @param {number} longMALookback Long MA period.
 * @returns {object} Market trend context and regime.
 */
function getMarketRegimeAndTrendContext(history, shortMALookback = 5, mediumMALookback = 10, longMALookback = 20) {
    const baseContext = getTrendContext(history, shortMALookback, mediumMALookback, longMALookback);
    let macroRegime = "UNCERTAIN";
    const { strength, volatility } = baseContext;
    let isTransitioning = false;

    const numbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));

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
    } else { // WEAK or UNKNOWN
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

/**
 * Basic trend context analysis based on moving averages and standard deviation.
 * @param {Array<object>} history Historical data.
 * @param {number} shortMALookback Short MA period.
 * @param {number} mediumMALookback Medium MA period.
 * @param {number} longMALookback Long MA period.
 * @returns {object} Trend strength, direction, volatility, and details.
 */
function getTrendContext(history, shortMALookback = 5, mediumMALookback = 10, longMALookback = 20) {
    if (!Array.isArray(history) || history.length < longMALookback) {
        return { strength: "UNKNOWN", direction: "NONE", volatility: "UNKNOWN", details: "Insufficient history", macroRegime: "UNKNOWN_REGIME", isTransitioning: false };
    }
    const numbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));
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

// --- Core Analytical Modules (Existing & Enhanced) ---

/**
 * Analyzes transitions between Big and Small outcomes.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeTransitions(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 15) return null;
    const transitions = { "BIG": { "BIG": 0, "SMALL": 0, "total": 0 }, "SMALL": { "BIG": 0, "SMALL": 0, "total": 0 } };
    for (let i = 0; i < history.length - 1; i++) {
        const currentBS = getBigSmallFromNumber(history[i]?.actual);
        const prevBS = getBigSmallFromNumber(history[i + 1]?.actual);
        if (currentBS && prevBS && transitions[prevBS]) {
            transitions[prevBS][currentBS]++;
            transitions[prevBS].total++;
        }
    }
    const lastOutcome = getBigSmallFromNumber(history[0]?.actual);
    if (!lastOutcome || !transitions[lastOutcome] || transitions[lastOutcome].total < 6) return null;
    const nextBigProb = transitions[lastOutcome]["BIG"] / transitions[lastOutcome].total;
    const nextSmallProb = transitions[lastOutcome]["SMALL"] / transitions[lastOutcome].total;
    if (nextBigProb > nextSmallProb + 0.30) return { prediction: "BIG", weight: baseWeight * nextBigProb, source: "Transition" };
    if (nextSmallProb > nextBigProb + 0.30) return { prediction: "SMALL", weight: baseWeight * nextSmallProb, source: "Transition" };
    return null;
}

/**
 * Analyzes streaks of consecutive Big or Small outcomes.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeStreaks(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 3) return null;
    const actuals = history.map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (actuals.length < 3) return null;
    let currentStreakType = actuals[0], currentStreakLength = 0;
    for (const outcome of actuals) {
        if (outcome === currentStreakType) currentStreakLength++; else break;
    }
    if (currentStreakLength >= 2) {
        const prediction = getOppositeOutcome(currentStreakType); // Predicts a streak break
        const weightFactor = Math.min(0.45 + (currentStreakLength * 0.18), 0.95);
        return { prediction, weight: baseWeight * weightFactor, source: `StreakBreak-${currentStreakLength}` };
    }
    return null;
}

/**
 * Analyzes alternating patterns (e.g., BIG-SMALL-BIG-SMALL).
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeAlternatingPatterns(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 5) return null;
    const actuals = history.slice(0, 5).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (actuals.length < 4) return null;
    if (actuals[0] === "SMALL" && actuals[1] === "BIG" && actuals[2] === "SMALL" && actuals[3] === "BIG")
        return { prediction: "SMALL", weight: baseWeight * 1.15, source: "Alt-BSBS->S" };
    if (actuals[0] === "BIG" && actuals[1] === "SMALL" && actuals[2] === "BIG" && actuals[3] === "SMALL")
        return { prediction: "BIG", weight: baseWeight * 1.15, source: "Alt-SBSB->B" };
    return null;
}

/**
 * Analyzes MACD (Moving Average Convergence Divergence).
 * @param {Array<object>} history Historical data.
 * @param {number} shortPeriod Short EMA period.
 * @param {number} longPeriod Long EMA period.
 * @param {number} signalPeriod Signal Line EMA period.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeMACD(history, shortPeriod, longPeriod, signalPeriod, baseWeight) {
    if (shortPeriod <=0 || longPeriod <=0 || signalPeriod <=0 || shortPeriod >= longPeriod) return null;
    const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
    if (actualNumbers.length < longPeriod + signalPeriod -1) return null;

    const emaShort = calculateEMA(actualNumbers, shortPeriod);
    const emaLong = calculateEMA(actualNumbers, longPeriod);

    if (emaShort === null || emaLong === null) return null;
    const macdLineCurrent = emaShort - emaLong;

    const macdLineValues = [];
    // Populate macdLineValues for signal line calculation
    for (let i = longPeriod -1; i < actualNumbers.length; i++) {
        const currentSlice = actualNumbers.slice(actualNumbers.length - 1 - i); // Slice from the end for chronological order
        const shortE = calculateEMA(currentSlice, shortPeriod);
        const longE = calculateEMA(currentSlice, longPeriod);
        if (shortE !== null && longE !== null) {
            macdLineValues.push(shortE - longE);
        }
    }

    if (macdLineValues.length < signalPeriod) return null;

    const signalLine = calculateEMA(macdLineValues.slice().reverse(), signalPeriod); // Reverse for EMA calculation
    if (signalLine === null) return null;

    const macdHistogram = macdLineCurrent - signalLine;
    let prediction = null;

    // MACD Cross-over signal
    if (macdLineValues.length >= signalPeriod + 1) {
        const prevMacdSliceForSignal = macdLineValues.slice(0, -1);
        const prevSignalLine = calculateEMA(prevMacdSliceForSignal.slice().reverse(), signalPeriod);
        const prevMacdLine = macdLineValues[macdLineValues.length - 2]; // Second to last MACD value

        if (prevSignalLine !== null && prevMacdLine !== null) {
            if (prevMacdLine <= prevSignalLine && macdLineCurrent > signalLine) prediction = "BIG"; // Bullish cross
            else if (prevMacdLine >= prevSignalLine && macdLineCurrent < signalLine) prediction = "SMALL"; // Bearish cross
        }
    }

    // Histogram divergence/strength signal if no cross-over
    if (!prediction) {
        if (macdHistogram > 0.25) prediction = "BIG";
        else if (macdHistogram < -0.25) prediction = "SMALL";
    }

    if (prediction) {
        const strengthFactor = Math.min(Math.abs(macdHistogram) / 0.6, 1.0); // Normalize strength
        return { prediction, weight: baseWeight * (0.55 + strengthFactor * 0.45), source: `MACD_${prediction === "BIG" ? "CrossB" : "CrossS"}` };
    }
    return null;
}

/**
 * Analyzes Bollinger Bands for overbought/oversold conditions.
 * @param {Array<object>} history Historical data.
 * @param {number} period Period for SMA and StdDev.
 * @param {number} stdDevMultiplier Multiplier for standard deviation.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeBollingerBands(history, period, stdDevMultiplier, baseWeight) {
    if (period <= 0) return null;
    const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
    if (actualNumbers.length < period) return null;

    const sma = calculateSMA(actualNumbers.slice(0, period), period);
    if (sma === null) return null;

    const stdDev = calculateStdDev(actualNumbers, period);
    if (stdDev === null || stdDev < 0.05) return null; // Avoid division by zero or tiny bands

    const upperBand = sma + (stdDev * stdDevMultiplier);
    const lowerBand = sma - (stdDev * stdDevMultiplier);
    const lastNumber = actualNumbers[0]; // Most recent number

    let prediction = null;

    // Price outside bands indicates potential reversal
    if (lastNumber > upperBand * 1.01) prediction = "SMALL"; // Price above upper band, predict pull back to SMALL
    else if (lastNumber < lowerBand * 0.99) prediction = "BIG"; // Price below lower band, predict pull back to BIG

    if (prediction) {
        const bandBreachStrength = Math.abs(lastNumber - sma) / (stdDev * stdDevMultiplier + 0.001); // How far outside the band
        return { prediction, weight: baseWeight * (0.65 + Math.min(bandBreachStrength, 0.9)*0.35), source: "Bollinger" };
    }
    return null;
}

/**
 * Analyzes Ichimoku Cloud for trend and support/resistance.
 * @param {Array<object>} history Historical data.
 * @param {number} tenkanPeriod Tenkan-sen period.
 * @param {number} kijunPeriod Kijun-sen period.
 * @param {number} senkouBPeriod Senkou Span B period.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeIchimokuCloud(history, tenkanPeriod, kijunPeriod, senkouBPeriod, baseWeight) {
    if (tenkanPeriod <=0 || kijunPeriod <=0 || senkouBPeriod <=0) return null;
    const chronologicalHistory = history.slice().reverse(); // Need chronological for Ichimoku
    const numbers = chronologicalHistory.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));

    // Ensure enough data for all components, especially for future-shifted spans
    if (numbers.length < Math.max(senkouBPeriod, kijunPeriod) + kijunPeriod -1 ) return null;

    const getHighLow = (dataSlice) => {
        if (!dataSlice || dataSlice.length === 0) return { high: null, low: null };
        return { high: Math.max(...dataSlice), low: Math.min(...dataSlice) };
    };

    // Calculate Tenkan-sen (Conversion Line)
    const tenkanSenValues = [];
    for (let i = 0; i < numbers.length; i++) {
        if (i < tenkanPeriod - 1) { tenkanSenValues.push(null); continue; }
        const { high, low } = getHighLow(numbers.slice(i - tenkanPeriod + 1, i + 1));
        if (high !== null && low !== null) tenkanSenValues.push((high + low) / 2); else tenkanSenValues.push(null);
    }

    // Calculate Kijun-sen (Base Line)
    const kijunSenValues = [];
    for (let i = 0; i < numbers.length; i++) {
        if (i < kijunPeriod - 1) { kijunSenValues.push(null); continue; }
        const { high, low } = getHighLow(numbers.slice(i - kijunPeriod + 1, i + 1));
        if (high !== null && low !== null) kijunSenValues.push((high + low) / 2); else kijunSenValues.push(null);
    }

    // Current Tenkan and Kijun (most recent values)
    const currentTenkan = tenkanSenValues[numbers.length - 1];
    const prevTenkan = tenkanSenValues[numbers.length - 2]; // For cross-over detection
    const currentKijun = kijunSenValues[numbers.length - 1];
    const prevKijun = kijunSenValues[numbers.length - 2]; // For cross-over detection

    // Calculate Senkou Span A (Leading Span A) - shifted forward
    const senkouSpanAValues = [];
    for(let i=0; i < numbers.length; i++) {
        if (tenkanSenValues[i] !== null && kijunSenValues[i] !== null) {
            senkouSpanAValues.push((tenkanSenValues[i] + kijunSenValues[i]) / 2);
        } else {
            senkouSpanAValues.push(null);
        }
    }

    // Calculate Senkou Span B (Leading Span B) - shifted forward
    const senkouSpanBValues = [];
    for (let i = 0; i < numbers.length; i++) {
        if (i < senkouBPeriod -1) { senkouSpanBValues.push(null); continue; }
        const { high, low } = getHighLow(numbers.slice(i - senkouBPeriod + 1, i + 1));
        if (high !== null && low !== null) senkouSpanBValues.push((high + low) / 2); else senkouSpanBValues.push(null);
    }

    // Get current (future-shifted) Senkou Spans
    const currentSenkouA = (numbers.length > kijunPeriod && senkouSpanAValues.length > numbers.length - 1 - kijunPeriod) ? senkouSpanAValues[numbers.length - 1 - kijunPeriod] : null;
    const currentSenkouB = (numbers.length > kijunPeriod && senkouSpanBValues.length > numbers.length - 1 - kijunPeriod) ? senkouSpanBValues[numbers.length - 1 - kijunPeriod] : null;

    // Chikou Span (Lagging Span) - current price shifted backward
    const chikouSpan = numbers[numbers.length - 1]; // Current price
    const priceKijunPeriodsAgo = numbers.length > kijunPeriod ? numbers[numbers.length - 1 - kijunPeriod] : null;

    const lastPrice = numbers[numbers.length - 1];
    if (lastPrice === null || currentTenkan === null || currentKijun === null || currentSenkouA === null || currentSenkouB === null || chikouSpan === null || priceKijunPeriodsAgo === null) {
        return null;
    }

    let prediction = null;
    let strengthFactor = 0.3; // Base strength

    // Tenkan-sen/Kijun-sen Cross-over
    let tkCrossSignal = null;
    if (prevTenkan !== null && prevKijun !== null) {
        if (prevTenkan <= prevKijun && currentTenkan > currentKijun) tkCrossSignal = "BIG"; // Bullish cross
        else if (prevTenkan >= prevKijun && currentTenkan < currentKijun) tkCrossSignal = "SMALL"; // Bearish cross
    }

    // Price vs. Cloud position
    const cloudTop = Math.max(currentSenkouA, currentSenkouB);
    const cloudBottom = Math.min(currentSenkouA, currentSenkouB);
    let priceVsCloudSignal = null;
    if (lastPrice > cloudTop) priceVsCloudSignal = "BIG"; // Price above cloud
    else if (lastPrice < cloudBottom) priceVsCloudSignal = "SMALL"; // Price below cloud

    // Chikou Span vs. Price (Kijun periods ago)
    let chikouSignal = null;
    if (chikouSpan > priceKijunPeriodsAgo) chikouSignal = "BIG"; // Chikou above price
    else if (chikouSpan < priceKijunPeriodsAgo) chikouSignal = "SMALL"; // Chikou below price

    // Combine signals for a stronger prediction
    if (tkCrossSignal && tkCrossSignal === priceVsCloudSignal && tkCrossSignal === chikouSignal) {
        prediction = tkCrossSignal; strengthFactor = 0.95; // All three agree - very strong
    }
    else if (priceVsCloudSignal && priceVsCloudSignal === tkCrossSignal && chikouSignal === priceVsCloudSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.85; // Strong agreement
    }
    else if (priceVsCloudSignal && priceVsCloudSignal === tkCrossSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.7; // Price and TK agree
    }
    else if (priceVsCloudSignal && priceVsCloudSignal === chikouSignal) {
        prediction = priceVsCloudSignal; strengthFactor = 0.65; // Price and Chikou agree
    }
    else if (tkCrossSignal && priceVsCloudSignal) { // If only two main signals align
        prediction = tkCrossSignal; strengthFactor = 0.55;
    }
    else if (priceVsCloudSignal) { // If only price vs cloud gives a clear signal
         prediction = priceVsCloudSignal; strengthFactor = 0.5;
    }

    // Additional strength from Kijun-sen bounce/break
    if (prediction === "BIG" && lastPrice > currentKijun && prevKijun !== null && numbers[numbers.length-2] <= prevKijun && priceVsCloudSignal === "BIG") {
        strengthFactor = Math.min(1.0, strengthFactor + 0.15); // Price crossed above Kijun and is above cloud
    } else if (prediction === "SMALL" && lastPrice < currentKijun && prevKijun !== null && numbers[numbers.length-2] >= prevKijun && priceVsCloudSignal === "SMALL") {
        strengthFactor = Math.min(1.0, strengthFactor + 0.15); // Price crossed below Kijun and is below cloud
    }

    if (prediction) return { prediction, weight: baseWeight * strengthFactor, source: "Ichimoku" };
    return null;
}

/**
 * Calculates entropy for a sequence of outcomes.
 * @param {Array<string>} outcomes Array of "BIG" or "SMALL" outcomes.
 * @param {number} windowSize The window size for entropy calculation.
 * @returns {number|null} Entropy value (0 to 1) or null.
 */
function calculateEntropyForSignal(outcomes, windowSize) {
    if (!Array.isArray(outcomes) || outcomes.length < windowSize) return null;
    const counts = { BIG: 0, SMALL: 0 };
    outcomes.slice(0, windowSize).forEach(o => { if (o) counts[o] = (counts[o] || 0) + 1; });
    let entropy = 0;
    const totalValidOutcomes = counts.BIG + counts.SMALL;
    if (totalValidOutcomes === 0) return 1; // Max entropy if no outcomes
    for (let key in counts) {
        if (counts[key] > 0) { const p = counts[key] / totalValidOutcomes; entropy -= p * Math.log2(p); }
    }
    // Normalize entropy to be between 0 and 1 (max entropy for 2 outcomes is 1)
    return isNaN(entropy) ? 1 : entropy / Math.log2(2); // Divide by log2(number of possible outcomes)
}

/**
 * Analyzes Volatility Breakout patterns.
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeVolatilityBreakout(history, trendContext, baseWeight) {
    if (trendContext.volatility === "VERY_LOW" && history.length >= 3) {
        const lastOutcome = getBigSmallFromNumber(history[0].actual);
        const prevOutcome = getBigSmallFromNumber(history[1].actual);
        // If very low volatility and a consecutive outcome, predict continuation
        if (lastOutcome && prevOutcome && lastOutcome === prevOutcome) return { prediction: lastOutcome, weight: baseWeight * 0.8, source: "VolSqueezeBreakoutCont" };
        // If very low volatility and an alternating outcome, predict continuation of the alternation (less confident)
        if (lastOutcome && prevOutcome && lastOutcome !== prevOutcome) return { prediction: lastOutcome, weight: baseWeight * 0.6, source: "VolSqueezeBreakoutInitial" };
    }
    return null;
}

/**
 * Analyzes Stochastic Oscillator for overbought/oversold and crosses.
 * @param {Array<object>} history Historical data.
 * @param {number} kPeriod %K period.
 * @param {number} dPeriod %D period.
 * @param {number} smoothK Smoothing period for %K.
 * @param {number} baseWeight Base weight for the signal.
 * @param {string} volatility Current volatility regime.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeStochastic(history, kPeriod, dPeriod, smoothK, baseWeight, volatility) {
    if (kPeriod <=0 || dPeriod <=0 || smoothK <=0) return null;
    const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
    if (actualNumbers.length < kPeriod + smoothK -1 + dPeriod -1) return null; // Ensure enough data for all calculations

    const chronologicalNumbers = actualNumbers.slice().reverse(); // For correct chronological calculations

    let kValues = [];
    for (let i = kPeriod - 1; i < chronologicalNumbers.length; i++) {
        const currentSlice = chronologicalNumbers.slice(i - kPeriod + 1, i + 1);
        const currentClose = currentSlice[currentSlice.length - 1];
        const lowestLow = Math.min(...currentSlice);
        const highestHigh = Math.max(...currentSlice);
        if (highestHigh === lowestLow) kValues.push(kValues.length > 0 ? kValues[kValues.length-1] : 50); // Handle flat line
        else kValues.push(100 * (currentClose - lowestLow) / (highestHigh - lowestLow));
    }

    if (kValues.length < smoothK) return null;
    const smoothedKValues = [];
    for(let i = 0; i <= kValues.length - smoothK; i++) {
        smoothedKValues.push(calculateSMA(kValues.slice(i, i + smoothK).slice().reverse(), smoothK));
    }

    if (smoothedKValues.length < dPeriod) return null;
    const dValues = [];
    for(let i = 0; i <= smoothedKValues.length - dPeriod; i++) {
        dValues.push(calculateSMA(smoothedKValues.slice(i, i + dPeriod).slice().reverse(), dPeriod));
    }

    if (smoothedKValues.length < 2 || dValues.length < 2) return null;

    const currentK = smoothedKValues[smoothedKValues.length - 1];
    const prevK = smoothedKValues[smoothedKValues.length - 2];
    const currentD = dValues[dValues.length - 1];
    const prevD = dValues[dValues.length - 1];

    // Dynamic overbought/oversold levels based on volatility
    let overbought = 80; let oversold = 20;
    if (volatility === "HIGH") { overbought = 88; oversold = 12; }
    else if (volatility === "MEDIUM") { overbought = 82; oversold = 18;}
    else if (volatility === "LOW") { overbought = 75; oversold = 25; }
    else if (volatility === "VERY_LOW") { overbought = 70; oversold = 30; }

    let prediction = null, strengthFactor = 0;

    // %K and %D cross-overs
    if (prevK <= prevD && currentK > currentD && currentK < overbought - 5) { // Bullish cross below overbought
         prediction = "BIG"; strengthFactor = Math.max(0.35, (oversold + 5 - Math.min(currentK, currentD, oversold + 5)) / (oversold + 5));
    } else if (prevK >= prevD && currentK < currentD && currentK > oversold + 5) { // Bearish cross above oversold
        prediction = "SMALL"; strengthFactor = Math.max(0.35, (Math.max(currentK, currentD, overbought - 5) - (overbought - 5)) / (100 - (overbought - 5)));
    }
    // Overbought/Oversold exit signals
    if (!prediction) {
        if (prevK < oversold && currentK >= oversold && currentK < (oversold + (overbought-oversold)/2) ) { // Exiting oversold
            prediction = "BIG"; strengthFactor = Math.max(0.25, (currentK - oversold) / ((overbought-oversold)/2) );
        } else if (prevK > overbought && currentK <= overbought && currentK > (oversold + (overbought-oversold)/2) ) { // Exiting overbought
            prediction = "SMALL"; strengthFactor = Math.max(0.25, (overbought - currentK) / ((overbought-oversold)/2) );
        }
    }
    if (prediction) return { prediction, weight: baseWeight * (0.5 + Math.min(strengthFactor, 1.0) * 0.5), source: "Stochastic" };
    return null;
}

/**
 * Fuses volatility and trend context for a combined signal.
 * @param {object} trendContext Current trend context.
 * @param {object} marketEntropyState Current market entropy state.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeVolatilityTrendFusion(trendContext, marketEntropyState, baseWeight) {
    const { direction, strength, volatility } = trendContext;
    const { state: entropy } = marketEntropyState;

    let prediction = null;
    let weightFactor = 0;

    // High-conviction trend continuation
    if (strength === 'STRONG' && (volatility === 'LOW' || volatility === 'MEDIUM') && entropy === 'ORDERLY') {
        prediction = direction.includes('BIG') ? 'BIG' : 'SMALL';
        weightFactor = 1.4;
    }
    // Trend exhaustion / reversal signal
    else if (strength === 'STRONG' && volatility === 'HIGH' && entropy.includes('CHAOS')) {
        prediction = direction.includes('BIG') ? 'SMALL' : 'BIG';
        weightFactor = 1.2;
    }
    // Ranging market mean reversion
    else if (strength === 'RANGING' && volatility === 'LOW' && entropy === 'ORDERLY') {
        prediction = Math.random() > 0.5 ? 'BIG' : 'SMALL'; // Less certain, random pick within range
        weightFactor = 0.8;
    }

    if (prediction) {
        return { prediction, weight: baseWeight * weightFactor, source: 'Vol-Trend-Fusion' };
    }
    return null;
}

/**
 * Simulates a general-purpose ML model for standard market conditions.
 * @param {object} features Feature set for the ML model.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeMLModelSignal_Standard(features, baseWeight) {
    if (!features) return null;
    const { rsi_14, macd_hist, trend_strength } = features; // Using relevant features

    let modelConfidence = 0;
    let prediction = null;

    // Example rules for a simulated ML model
    if (rsi_14 > 70 && macd_hist < -0.1 && trend_strength < 2) { // Overbought, bearish MACD, weak trend
        prediction = "SMALL";
        modelConfidence = Math.abs(macd_hist) + (rsi_14 - 70) / 30;
    } else if (rsi_14 < 30 && macd_hist > 0.1 && trend_strength < 2) { // Oversold, bullish MACD, weak trend
        prediction = "BIG";
        modelConfidence = Math.abs(macd_hist) + (30 - rsi_14) / 30;
    } else if (trend_strength > 0 && macd_hist > 0.2) { // Strong trend, bullish MACD
        prediction = "BIG";
        modelConfidence = 0.5 + trend_strength * 0.2;
    }

    if (prediction) {
        const weight = baseWeight * Math.min(1.0, modelConfidence) * 1.5;
        return { prediction, weight: weight, source: "ML-Standard" };
    }
    return null;
}

/**
 * Simulates an ML model trained specifically for volatile, non-trending markets.
 * @param {object} features Feature set for the ML model.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeMLModelSignal_Volatile(features, baseWeight) {
    if (!features) return null;
    const { rsi_14, stddev_30, last_5_mean, last_20_mean } = features;

    let modelConfidence = 0;
    let prediction = null;

    // In high volatility, look for extreme RSI for mean reversion
    if (stddev_30 > 2.5) { // High volatility detected
        if (rsi_14 > 80 && last_5_mean > last_20_mean) { // Extreme overbought, recent mean above longer mean
            prediction = "SMALL";
            modelConfidence = (rsi_14 - 80) / 20;
        } else if (rsi_14 < 20 && last_5_mean < last_20_mean) { // Extreme oversold, recent mean below longer mean
            prediction = "BIG";
            modelConfidence = (20 - rsi_14) / 20;
        }
    }

    if (prediction) {
        const weight = baseWeight * Math.min(1.0, modelConfidence) * 1.7; // Higher importance for specialist model
        return { prediction, weight: weight, source: "ML-Volatile" };
    }
    return null;
}

// --- New Specialized Analytical Modules (User Requested) ---

/**
 * 1. Shot Trend Pattern Analyzer: Detects very short-term trends or immediate reversals.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeShortTermTrendPatterns(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 3) return null;
    const outcomes = history.slice(0, 3).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (outcomes.length < 3) return null;

    // Example: Two consecutive same outcomes, predict continuation
    if (outcomes[0] === outcomes[1] && outcomes[0] === outcomes[2]) {
        return { prediction: outcomes[0], weight: baseWeight * 0.9, source: "ShortTrend_Continuation" };
    }
    // Example: Immediate reversal after two same
    if (outcomes[0] !== outcomes[1] && outcomes[1] === outcomes[2]) {
        return { prediction: outcomes[0], weight: baseWeight * 0.7, source: "ShortTrend_QuickReversal" };
    }
    return null;
}

/**
 * 2. Long Trend Pattern Analyzer: Identifies sustained trends using longer lookbacks.
 * This function will leverage existing MACD and Ichimoku, but can add more specific long-term trend rules.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeLongTermTrendPatterns(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 30) return null;
    const numbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));
    if (numbers.length < 30) return null;

    const longEMA = calculateEMA(numbers, 20);
    const veryLongEMA = calculateEMA(numbers, 50);

    if (longEMA === null || veryLongEMA === null) return null;

    let prediction = null;
    let strengthFactor = 0.5;

    // Long-term trend based on EMA cross and separation
    if (longEMA > veryLongEMA * 1.02) { // Long EMA significantly above Very Long EMA
        prediction = "BIG";
        strengthFactor = Math.min(1.0, (longEMA - veryLongEMA) / veryLongEMA * 10); // Strength based on separation
    } else if (longEMA < veryLongEMA * 0.98) { // Long EMA significantly below Very Long EMA
        prediction = "SMALL";
        strengthFactor = Math.min(1.0, (veryLongEMA - longEMA) / veryLongEMA * 10);
    }

    if (prediction) {
        return { prediction, weight: baseWeight * (0.6 + strengthFactor * 0.4), source: "LongTrend_EMA" };
    }
    return null;
}

/**
 * 3. General Pattern Detector: Aims to detect a wider range of common Big/Small patterns.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function detectAnyPattern(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 6) return null;
    const outcomes = history.slice(0, 6).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (outcomes.length < 6) return null;

    // Pattern: AABB (e.g., BBSS or SSBB)
    if (outcomes[0] === outcomes[1] && outcomes[2] === outcomes[3] && outcomes[0] !== outcomes[2]) {
        // Predict continuation of the last pair's trend
        return { prediction: outcomes[2], weight: baseWeight * 0.8, source: "Pattern_AABB" };
    }
    // Pattern: ABABA (e.g., BSB SB or SBSBS) - predicts continuation of alternation
    if (outcomes[0] !== outcomes[1] && outcomes[1] !== outcomes[2] && outcomes[2] !== outcomes[3] && outcomes[3] !== outcomes[4] &&
        outcomes[0] === outcomes[2] && outcomes[1] === outcomes[3] && outcomes[2] === outcomes[4]) {
        return { prediction: getOppositeOutcome(outcomes[0]), weight: baseWeight * 0.9, source: "Pattern_ABABA" };
    }
    // Pattern: Triple (AAA) followed by reversal (B), predict continuation of reversal
    if (outcomes[0] !== outcomes[1] && outcomes[1] === outcomes[2] && outcomes[2] === outcomes[3]) {
        return { prediction: outcomes[0], weight: baseWeight * 0.85, source: "Pattern_TripleReversal" };
    }
    return null;
}

/**
 * 4. Reversal Pattern Analyzer: Focuses on signals indicating a shift in direction.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @param {string} volatility Current volatility regime.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeReversalPatterns(history, baseWeight, volatility) {
    // Leverage existing reversal indicators
    const rsiSignal = analyzeRSI(history, 14, baseWeight * 1.2, volatility); // Higher weight for reversal focus
    if (rsiSignal && (rsiSignal.prediction === "BIG" && rsiSignal.weight > baseWeight * 0.8 || rsiSignal.prediction === "SMALL" && rsiSignal.weight > baseWeight * 0.8)) {
        return { ...rsiSignal, source: "Reversal_RSI" };
    }

    const bollingerSignal = analyzeBollingerBands(history, 20, 2.1, baseWeight * 1.1); // Higher weight for reversal focus
    if (bollingerSignal) {
        return { ...bollingerSignal, source: "Reversal_Bollinger" };
    }

    const stochasticSignal = analyzeStochastic(history, 14, 3, 3, baseWeight * 1.2, volatility); // Higher weight for reversal focus
    if (stochasticSignal && (stochasticSignal.prediction === "BIG" && stochasticSignal.weight > baseWeight * 0.8 || stochasticSignal.prediction === "SMALL" && stochasticSignal.weight > baseWeight * 0.8)) {
        return { ...stochasticSignal, source: "Reversal_Stochastic" };
    }

    // New: Double Top/Bottom (simulated for Big/Small)
    if (history.length >= 5) {
        const outcomes = history.slice(0, 5).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
        if (outcomes.length === 5) {
            // Simulated Double Top: BIG-SMALL-BIG-SMALL-BIG, predict SMALL
            if (outcomes[0] === "BIG" && outcomes[1] === "SMALL" && outcomes[2] === "BIG" && outcomes[3] === "SMALL" && outcomes[4] === "BIG") {
                return { prediction: "SMALL", weight: baseWeight * 1.0, source: "Reversal_DoubleTop" };
            }
            // Simulated Double Bottom: SMALL-BIG-SMALL-BIG-SMALL, predict BIG
            if (outcomes[0] === "SMALL" && outcomes[1] === "BIG" && outcomes[2] === "SMALL" && outcomes[3] === "BIG" && outcomes[4] === "SMALL") {
                return { prediction: "BIG", weight: baseWeight * 1.0, source: "Reversal_DoubleBottom" };
            }
        }
    }
    return null;
}

/**
 * 5. AI-Powered Long Data Analyzer: Utilizes simulated ML models with long-term features.
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {object} time Current time features.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeAIPoweredLongData(history, trendContext, time, baseWeight) {
    const mlFeatures = createFeatureSetForML(history, trendContext, time);
    if (!mlFeatures) return null;

    // Prioritize standard ML model in stable/trending conditions
    if (trendContext.strength !== 'RANGING' && trendContext.volatility !== 'HIGH') {
        const standardML = analyzeMLModelSignal_Standard(mlFeatures, baseWeight * 1.0);
        if (standardML) return { ...standardML, source: "AI_LongData_Standard" };
    } else { // Prioritize volatile ML model in ranging/high volatility
        const volatileML = analyzeMLModelSignal_Volatile(mlFeatures, baseWeight * 1.1); // Slightly higher base weight for specialist
        if (volatileML) return { ...volatileML, source: "AI_LongData_Volatile" };
    }
    return null;
}

/**
 * 6. Unique Pattern & Anomaly Detector: Finds rare or statistically unusual patterns.
 * "Fuck Game" implies looking for patterns that defy simple expectations or exploit subtle biases.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function findUniquePatternsAndAnomalies(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 10) return null;
    const outcomes = history.map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (outcomes.length < 10) return null;

    // Anomaly: Extreme imbalance in recent outcomes
    const recentOutcomes = outcomes.slice(0, 5);
    const bigCount = recentOutcomes.filter(o => o === "BIG").length;
    const smallCount = recentOutcomes.filter(o => o === "SMALL").length;

    if (bigCount === 5) { // 5 consecutive BIGs
        return { prediction: "SMALL", weight: baseWeight * 1.3, source: "Unique_ExtremeBigStreak" };
    }
    if (smallCount === 5) { // 5 consecutive SMALLs
        return { prediction: "BIG", weight: baseWeight * 1.3, source: "Unique_ExtremeSmallStreak" };
    }

    // Anomaly: Very low entropy in a short window (predicts a break)
    const shortEntropy = calculateEntropyForSignal(outcomes.slice(0, 5), 5);
    if (shortEntropy !== null && shortEntropy < 0.2) { // Very predictable, likely to break
        const lastOutcome = outcomes[0];
        if (lastOutcome) return { prediction: getOppositeOutcome(lastOutcome), weight: baseWeight * 1.1, source: "Unique_LowEntropyBreak" };
    }

    // Anomaly: Repetitive pattern that suddenly breaks (e.g., ABAB -> A)
    if (outcomes.length >= 6) {
        if (outcomes[0] === outcomes[2] && outcomes[1] === outcomes[3] && outcomes[0] !== outcomes[1] && outcomes[4] === outcomes[0] && outcomes[5] === outcomes[1]) {
            // Pattern ABABAB, predict continuation
            return { prediction: getOppositeOutcome(outcomes[0]), weight: baseWeight * 1.0, source: "Unique_RepeatingAlternation" };
        }
    }

    return null;
}

/**
 * 7. Big/Small Pattern Classifier: Provides a comprehensive set of Big/Small pattern signals.
 * This module integrates and expands upon existing pattern analysis.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function classifyBigSmallPatterns(history, baseWeight) {
    let signals = [];

    // Integrate existing pattern analysis
    const transitionSignal = analyzeTransitions(history, baseWeight * 0.9);
    if (transitionSignal) signals.push({ ...transitionSignal, source: "BS_Pattern_Transition" });

    const streakSignal = analyzeStreaks(history, baseWeight * 0.8);
    if (streakSignal) signals.push({ ...streakSignal, source: "BS_Pattern_Streak" });

    const alternatingSignal = analyzeAlternatingPatterns(history, baseWeight * 0.95);
    if (alternatingSignal) signals.push({ ...alternatingSignal, source: "BS_Pattern_Alternating" });

    // New: Triple-same pattern (e.g., BBB or SSS)
    if (history.length >= 3) {
        const outcomes = history.slice(0, 3).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
        if (outcomes.length === 3 && outcomes[0] === outcomes[1] && outcomes[1] === outcomes[2]) {
            // Predict a break after 3 same
            signals.push({ prediction: getOppositeOutcome(outcomes[0]), weight: baseWeight * 0.7, source: "BS_Pattern_TripleSame" });
        }
    }

    // New: Two pairs (e.g., BBSS or SSBB)
    if (history.length >= 4) {
        const outcomes = history.slice(0, 4).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
        if (outcomes.length === 4 && outcomes[0] === outcomes[1] && outcomes[2] === outcomes[3] && outcomes[0] !== outcomes[2]) {
            // Predict continuation of the last pair
            signals.push({ prediction: outcomes[2], weight: baseWeight * 0.65, source: "BS_Pattern_TwoPairs" });
        }
    }

    // Combine signals from this classifier
    if (signals.length > 0) {
        let bigVotes = 0;
        let smallVotes = 0;
        signals.forEach(s => {
            if (s.prediction === "BIG") bigVotes += s.weight;
            else smallVotes += s.weight;
        });

        if (bigVotes > smallVotes * 1.2) return { prediction: "BIG", weight: bigVotes / signals.length, source: "BS_Pattern_Classifier" };
        if (smallVotes > bigVotes * 1.2) return { prediction: "SMALL", weight: smallVotes / signals.length, source: "BS_Pattern_Classifier" };
    }
    return null;
}

/**
 * 8. Analyze Recent Jackpot Numbers: Analyzes the actual numerical values for patterns/biases.
 * @param {Array<object>} history Historical data.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function analyzeRecentJackpotNumbers(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 10) return null;
    const numbers = history.slice(0, 10).map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));
    if (numbers.length < 10) return null;

    let prediction = null;
    let strengthFactor = 0.5;

    // Analyze parity (Even/Odd)
    const evenCount = numbers.filter(n => n % 2 === 0).length;
    const oddCount = numbers.length - evenCount;
    if (evenCount / numbers.length >= 0.7) { // Majority Even, predict Odd (mean reversion)
        prediction = (getBigSmallFromNumber(numbers[0]) === "BIG") ? "SMALL" : "BIG"; // Predict opposite of current Big/Small
        strengthFactor = 0.7;
        return { prediction, weight: baseWeight * strengthFactor, source: "Jackpot_ParityBias" };
    }
    if (oddCount / numbers.length >= 0.7) { // Majority Odd, predict Even
        prediction = (getBigSmallFromNumber(numbers[0]) === "BIG") ? "SMALL" : "BIG";
        strengthFactor = 0.7;
        return { prediction, weight: baseWeight * strengthFactor, source: "Jackpot_ParityBias" };
    }

    // Analyze digit distribution (e.g., prevalence of 0, 9)
    const lastDigits = numbers.map(n => n % 10);
    const zeroCount = lastDigits.filter(d => d === 0).length;
    const nineCount = lastDigits.filter(d => d === 9).length;

    if (zeroCount >= 3) { // Many zeros recently, predict non-zero (likely BIG)
        prediction = "BIG"; // 0 is SMALL, so predict BIG
        strengthFactor = 0.6;
        return { prediction, weight: baseWeight * strengthFactor, source: "Jackpot_ZeroBias" };
    }
    if (nineCount >= 3) { // Many nines recently, predict non-nine (likely SMALL)
        prediction = "SMALL"; // 9 is BIG, so predict SMALL
        strengthFactor = 0.6;
        return { prediction, weight: baseWeight * strengthFactor, source: "Jackpot_NineBias" };
    }

    return null;
}

/**
 * 9. Finding All Unique Hard Patterns: Identifies complex, less obvious patterns.
 * This might involve confluence of weaker signals or specific sequences that are not simple.
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {object} marketEntropyState Current market entropy state.
 * @param {number} baseWeight Base weight for the signal.
 * @returns {object|null} Prediction, weight, and source.
 */
function identifyHardPatterns(history, trendContext, marketEntropyState, baseWeight) {
    if (!Array.isArray(history) || history.length < 20) return null;
    const outcomes = history.map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (outcomes.length < 20) return null;

    let prediction = null;
    let strengthFactor = 0.5;

    // Hard Pattern 1: Volatility Contraction followed by a specific Big/Small sequence
    if (trendContext.volatility === "VERY_LOW" && marketEntropyState.state === "ORDERLY") {
        const recentOutcomes = outcomes.slice(0, 5);
        if (recentOutcomes.length === 5) {
            // Example: S-B-S-B-S in low volatility, predict BIG breakout
            if (recentOutcomes[0] === "SMALL" && recentOutcomes[1] === "BIG" && recentOutcomes[2] === "SMALL" && recentOutcomes[3] === "BIG" && recentOutcomes[4] === "SMALL") {
                prediction = "BIG";
                strengthFactor = 1.1;
                return { prediction, weight: baseWeight * strengthFactor, source: "HardPattern_VolContractionBreakout" };
            }
        }
    }

    // Hard Pattern 2: Discrepancy between short-term and long-term trend
    const numbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));
    if (numbers.length >= 20) {
        const shortMA = calculateEMA(numbers, 5);
        const longMA = calculateEMA(numbers, 20);
        const lastOutcome = outcomes[0];

        if (shortMA !== null && longMA !== null && lastOutcome) {
            // Short-term trend is opposite to long-term trend, and last outcome confirms short-term
            if (shortMA > longMA && lastOutcome === "BIG" && trendContext.direction === "SMALL") {
                // Long-term is SMALL, but short-term is BIG and last outcome is BIG. Predict continuation of short-term (counter-trend)
                prediction = "BIG";
                strengthFactor = 0.9;
                return { prediction, weight: baseWeight * strengthFactor, source: "HardPattern_CounterTrendMomentum" };
            }
            if (shortMA < longMA && lastOutcome === "SMALL" && trendContext.direction === "BIG") {
                // Long-term is BIG, but short-term is SMALL and last outcome is SMALL. Predict continuation of short-term
                prediction = "SMALL";
                strengthFactor = 0.9;
                return { prediction, weight: baseWeight * strengthFactor, source: "HardPattern_CounterTrendMomentum" };
            }
        }
    }

    return null;
}


// --- Trend Stability & Market Entropy ---
/**
 * Analyzes the stability of the recent trend/patterns.
 * @param {Array<object>} history Historical data.
 * @returns {object} Stability status, reason, details, and dominance.
 */
function analyzeTrendStability(history) {
    if (!Array.isArray(history) || history.length < 25) {
        return { isStable: true, reason: "Not enough data for stability check.", details: "", dominance: "NONE" };
    }
    const confirmedHistory = history.filter(p => p && (p.status === "Win" || p.status === "Loss") && typeof p.actual !== 'undefined' && p.actual !== null);
    if (confirmedHistory.length < 20) return { isStable: true, reason: "Not enough confirmed results.", details: `Confirmed: ${confirmedHistory.length}`, dominance: "NONE" };

    const recentResults = confirmedHistory.slice(0, 20).map(p => getBigSmallFromNumber(p.actual)).filter(r => r);
    if (recentResults.length < 18) return { isStable: true, reason: "Not enough valid B/S for stability.", details: `Valid B/S: ${recentResults.length}`, dominance: "NONE" };

    const bigCount = recentResults.filter(r => r === "BIG").length;
    const smallCount = recentResults.filter(r => r === "SMALL").length;
    let outcomeDominance = "NONE";

    if (bigCount / recentResults.length >= 0.80) {
        outcomeDominance = "BIG_DOMINANCE";
        return { isStable: false, reason: "Unstable: Extreme Outcome Dominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }
    if (smallCount / recentResults.length >= 0.80) {
        outcomeDominance = "SMALL_DOMINANCE";
        return { isStable: false, reason: "Unstable: Extreme Outcome Dominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }

    const entropy = calculateEntropyForSignal(recentResults, recentResults.length);
    if (entropy !== null && entropy < 0.45) {
        return { isStable: false, reason: "Unstable: Very Low Entropy (Highly Predictable/Stuck)", details: `Entropy: ${entropy.toFixed(2)}`, dominance: outcomeDominance };
    }

    const actualNumbersRecent = confirmedHistory.slice(0, 15).map(p => parseInt(p.actualNumber || p.actual)).filter(n => !isNaN(n));
    if (actualNumbersRecent.length >= 10) {
        const stdDevNum = calculateStdDev(actualNumbersRecent, actualNumbersRecent.length);
        if (stdDevNum !== null && stdDevNum > 3.3) {
            return { isStable: false, reason: "Unstable: High Numerical Volatility", details: `StdDev: ${stdDevNum.toFixed(2)}`, dominance: outcomeDominance };
        }
    }
    let alternations = 0;
    for (let i = 0; i < recentResults.length - 1; i++) {
        if (recentResults[i] !== recentResults[i + 1]) alternations++;
    }
    if (alternations / recentResults.length > 0.75) {
        return { isStable: false, reason: "Unstable: Excessive Choppiness", details: `Alternations: ${alternations}/${recentResults.length}`, dominance: outcomeDominance };
    }

    return { isStable: true, reason: "Trend appears stable.", details: `Entropy: ${entropy !== null ? entropy.toFixed(2) : 'N/A'}`, dominance: outcomeDominance };
}

/**
 * Analyzes the market's entropy state (orderly, chaotic, transitioning).
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {object} stability Current trend stability.
 * @returns {object} Entropy state and details.
 */
function analyzeMarketEntropyState(history, trendContext, stability) {
    const ENTROPY_WINDOW_SHORT = 10;
    const ENTROPY_WINDOW_LONG = 25;
    const VOL_CHANGE_THRESHOLD = 0.3;

    if (history.length < ENTROPY_WINDOW_LONG) return { state: "UNCERTAIN_ENTROPY", details: "Insufficient history for entropy state." };

    const outcomesShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => getBigSmallFromNumber(e.actual));
    const outcomesLong = history.slice(0, ENTROPY_WINDOW_LONG).map(e => getBigSmallFromNumber(e.actual));

    const entropyShort = calculateEntropyForSignal(outcomesShort, ENTROPY_WINDOW_SHORT);
    const entropyLong = calculateEntropyForSignal(outcomesLong, ENTROPY_WINDOW_LONG);

    const numbersShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));
    const numbersLongPrev = history.slice(ENTROPY_WINDOW_SHORT, ENTROPY_WINDOW_SHORT + ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));

    let shortTermVolatility = null, prevShortTermVolatility = null;
    if(numbersShort.length >= ENTROPY_WINDOW_SHORT * 0.8) shortTermVolatility = calculateStdDev(numbersShort, numbersShort.length);
    if(numbersLongPrev.length >= ENTROPY_WINDOW_SHORT * 0.8) prevShortTermVolatility = calculateStdDev(numbersLongPrev, numbersLongPrev.length);


    let state = "STABLE_MODERATE";
    let details = `E_S:${entropyShort?.toFixed(2)} E_L:${entropyLong?.toFixed(2)} Vol_S:${shortTermVolatility?.toFixed(2)} Vol_P:${prevShortTermVolatility?.toFixed(2)}`;

    if (entropyShort === null || entropyLong === null) return { state: "UNCERTAIN_ENTROPY", details };

    if (entropyShort < 0.5 && entropyLong < 0.6 && shortTermVolatility !== null && shortTermVolatility < 1.5) {
        state = "ORDERLY"; // Low entropy, low volatility - predictable
    }
    else if (entropyShort > 0.95 && entropyLong > 0.9) {
        if (shortTermVolatility && prevShortTermVolatility && shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && shortTermVolatility > 2.5) {
            state = "RISING_CHAOS"; // High entropy, increasing high volatility
        } else {
            state = "STABLE_CHAOS"; // High entropy, stable high volatility
        }
    }
    else if (shortTermVolatility && prevShortTermVolatility) {
        if (shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && entropyShort > 0.85 && shortTermVolatility > 2.0) {
            state = "RISING_CHAOS";
        } else if (shortTermVolatility < prevShortTermVolatility * (1 - VOL_CHANGE_THRESHOLD) && entropyLong > 0.85 && entropyShort < 0.80) {
            state = "SUBSIDING_CHAOS"; // Volatility decreasing, but still high entropy
        }
    }

    if (!stability.isStable && (state === "ORDERLY" || state === "STABLE_MODERATE")) {
        state = "POTENTIAL_CHAOS_FROM_INSTABILITY"; // Override if underlying instability exists
        details += ` | StabilityOverride: ${stability.reason}`;
    }
    return { state, details };
}

/**
 * Analyzes advanced market regimes based on trend context and entropy.
 * @param {object} trendContext Current trend context.
 * @param {object} marketEntropyState Current market entropy state.
 * @returns {object} Probabilities for different regimes and details.
 */
function analyzeAdvancedMarketRegime(trendContext, marketEntropyState) {
    const { strength, volatility } = trendContext;
    const { state: entropy } = marketEntropyState;

    let probabilities = {
        bullTrend: 0.25,
        bearTrend: 0.25,
        volatileRange: 0.25,
        quietRange: 0.25
    };

    if (strength === 'STRONG' && volatility !== 'HIGH' && entropy === 'ORDERLY') {
        if (trendContext.direction.includes('BIG')) {
            probabilities = { bullTrend: 0.8, bearTrend: 0.05, volatileRange: 0.1, quietRange: 0.05 };
        } else {
            probabilities = { bullTrend: 0.05, bearTrend: 0.8, volatileRange: 0.1, quietRange: 0.05 };
        }
    } else if (strength === 'RANGING' && volatility === 'HIGH' && entropy.includes('CHAOS')) {
         probabilities = { bullTrend: 0.1, bearTrend: 0.1, volatileRange: 0.7, quietRange: 0.1 };
    } else if (strength === 'RANGING' && volatility === 'VERY_LOW') {
         probabilities = { bullTrend: 0.1, bearTrend: 0.1, volatileRange: 0.1, quietRange: 0.7 };
    }

    return { probabilities, details: `Prob(B:${probabilities.bullTrend.toFixed(2)},S:${probabilities.bearTrend.toFixed(2)})` };
}


// --- Signal & Regime Performance Learning ---
let signalPerformance = {};
const PERFORMANCE_WINDOW = 30;
const SESSION_PERFORMANCE_WINDOW = 15; // Not currently used directly in adjustment, but for tracking
const MIN_OBSERVATIONS_FOR_ADJUST = 10;
const MAX_WEIGHT_FACTOR = 1.95;
const MIN_WEIGHT_FACTOR = 0.05;
const MAX_ALPHA_FACTOR = 1.6;
const MIN_ALPHA_FACTOR = 0.4;
const MIN_ABSOLUTE_WEIGHT = 0.0003;
const INACTIVITY_PERIOD_FOR_DECAY = PERFORMANCE_WINDOW * 3;
const DECAY_RATE = 0.025;
const ALPHA_UPDATE_RATE = 0.04;
const PROBATION_THRESHOLD_ACCURACY = 0.40;
const PROBATION_MIN_OBSERVATIONS = 15;
const PROBATION_WEIGHT_CAP = 0.10;
let driftDetector = { p_min: Infinity, s_min: Infinity, n: 0, warning_level: 2.0, drift_level: 3.0 };

/**
 * Dynamically adjusts a signal's weight based on its historical performance and current context.
 * @param {string} signalSourceName Name of the signal source.
 * @param {number} baseWeight Initial base weight.
 * @param {number} currentPeriodFull Current timestamp/period.
 * @param {string} currentVolatilityRegime Current volatility regime.
 * @param {Array<object>} sessionHistory History for session-specific performance.
 * @returns {number} Adjusted weight.
 */
function getDynamicWeightAdjustment(signalSourceName, baseWeight, currentPeriodFull, currentVolatilityRegime, sessionHistory) {
    const perf = signalPerformance[signalSourceName];
    if (!perf) {
        signalPerformance[signalSourceName] = {
            correct: 0, total: 0, recentAccuracy: [],
            sessionCorrect: 0, sessionTotal: 0,
            lastUpdatePeriod: null, lastActivePeriod: null,
            currentAdjustmentFactor: 1.0, alphaFactor: 1.0, longTermImportanceScore: 0.5,
            performanceByVolatility: {}, isOnProbation: false
        };
        return Math.max(baseWeight, MIN_ABSOLUTE_WEIGHT);
    }

    // Reset session stats if a new session starts (simple check based on history length)
    if (sessionHistory.length <= 1) {
        perf.sessionCorrect = 0;
        perf.sessionTotal = 0;
    }

    // Apply decay for inactive signals
    if (perf.lastUpdatePeriod !== currentPeriodFull) {
        if (perf.lastActivePeriod !== null && (currentPeriodFull - perf.lastActivePeriod) > INACTIVITY_PERIOD_FOR_DECAY) {
            if (perf.currentAdjustmentFactor > 1.0) perf.currentAdjustmentFactor = Math.max(1.0, perf.currentAdjustmentFactor - DECAY_RATE);
            else if (perf.currentAdjustmentFactor < 1.0) perf.currentAdjustmentFactor = Math.min(1.0, perf.currentAdjustmentFactor + DECAY_RATE);
            if (perf.isOnProbation) perf.isOnProbation = false; // Come off probation if inactive
        }
        perf.lastUpdatePeriod = currentPeriodFull;
    }

    // Volatility-specific adjustment
    let volatilitySpecificAdjustment = 1.0;
    if (perf.performanceByVolatility[currentVolatilityRegime] && perf.performanceByVolatility[currentVolatilityRegime].total >= MIN_OBSERVATIONS_FOR_ADJUST / 2.0) {
        const volPerf = perf.performanceByVolatility[currentVolatilityRegime];
        const volAccuracy = volPerf.correct / volPerf.total;
        const volDeviation = volAccuracy - 0.5;
        volatilitySpecificAdjustment = 1 + (volDeviation * 1.30);
        volatilitySpecificAdjustment = Math.min(Math.max(volatilitySpecificAdjustment, 0.55), 1.45);
    }

    // Session-specific adjustment (short-term feedback)
    let sessionAdjustmentFactor = 1.0;
    if (perf.sessionTotal >= 3) {
        const sessionAccuracy = perf.sessionCorrect / perf.sessionTotal;
        const sessionDeviation = sessionAccuracy - 0.5;
        sessionAdjustmentFactor = 1 + (sessionDeviation * 1.5);
        sessionAdjustmentFactor = Math.min(Math.max(sessionAdjustmentFactor, 0.6), 1.4);
    }

    // Combine all factors
    let finalAdjustmentFactor = perf.currentAdjustmentFactor * perf.alphaFactor * volatilitySpecificAdjustment * sessionAdjustmentFactor * (0.70 + perf.longTermImportanceScore * 0.6);

    // Apply probation cap if on probation
    if (perf.isOnProbation) {
        finalAdjustmentFactor = Math.min(finalAdjustmentFactor, PROBATION_WEIGHT_CAP);
    }

    let adjustedWeight = baseWeight * finalAdjustmentFactor;
    return Math.max(adjustedWeight, MIN_ABSOLUTE_WEIGHT);
}

/**
 * Updates the performance metrics for individual signals.
 * @param {Array<object>} contributingSignals Signals that contributed to the last prediction.
 * @param {string} actualOutcome The actual outcome of the last period.
 * @param {number} periodFull Full timestamp of the last period.
 * @param {string} currentVolatilityRegime Volatility regime of the last period.
 * @param {number} lastFinalConfidence Confidence of the last prediction.
 * @param {boolean} concentrationModeActive Whether concentration mode was active.
 * @param {string} marketEntropyState Entropy state of the last period.
 */
function updateSignalPerformance(contributingSignals, actualOutcome, periodFull, currentVolatilityRegime, lastFinalConfidence, concentrationModeActive, marketEntropyState) {
    if (!actualOutcome || !contributingSignals || contributingSignals.length === 0) return;
    const isHighConfidencePrediction = lastFinalConfidence > 0.75;
    const lastPredictedOutcome = lastFinalConfidence > 0.5 ? "BIG" : "SMALL"; // Assuming BIG for >0.5, SMALL for <=0.5
    const isOverallCorrect = actualOutcome === lastPredictedOutcome;

    contributingSignals.forEach(signal => {
        if (!signal || !signal.source) return;
        const source = signal.source;
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

        // Only update if this signal was active for this period
        if (signalPerformance[source].lastActivePeriod !== periodFull || signalPerformance[source].total === 0) {
            signalPerformance[source].total++;
            signalPerformance[source].sessionTotal++;
            signalPerformance[source].performanceByVolatility[currentVolatilityRegime].total++;
            let outcomeCorrect = (signal.prediction === actualOutcome) ? 1 : 0;
            if (outcomeCorrect) {
                signalPerformance[source].correct++;
                signalPerformance[source].sessionCorrect++;
                signalPerformance[source].performanceByVolatility[currentVolatilityRegime].correct++;
            }

            // Adjust long-term importance score
            let importanceDelta = 0;
            if(outcomeCorrect) {
                importanceDelta = isHighConfidencePrediction ? 0.025 : 0.01;
            } else {
                importanceDelta = isHighConfidencePrediction && !isOverallCorrect ? -0.040 : -0.015;
            }

            if (concentrationModeActive || marketEntropyState.includes("CHAOS")) {
                 importanceDelta *= 1.5; // More aggressive learning in tough conditions
            }
            signalPerformance[source].longTermImportanceScore = Math.min(1.0, Math.max(0.0, signalPerformance[source].longTermImportanceScore + importanceDelta));

            // Update recent accuracy history
            signalPerformance[source].recentAccuracy.push(outcomeCorrect);
            if (signalPerformance[source].recentAccuracy.length > PERFORMANCE_WINDOW) {
                signalPerformance[source].recentAccuracy.shift();
            }

            // Calculate and apply adjustment factor
            if (signalPerformance[source].total >= MIN_OBSERVATIONS_FOR_ADJUST && signalPerformance[source].recentAccuracy.length >= PERFORMANCE_WINDOW / 2) {
                const recentCorrectCount = signalPerformance[source].recentAccuracy.reduce((sum, acc) => sum + acc, 0);
                const accuracy = recentCorrectCount / signalPerformance[source].recentAccuracy.length;
                const deviation = accuracy - 0.5;
                let newAdjustmentFactor = 1 + (deviation * 3.5); // More aggressive adjustment
                newAdjustmentFactor = Math.min(Math.max(newAdjustmentFactor, MIN_WEIGHT_FACTOR), MAX_WEIGHT_FACTOR);
                signalPerformance[source].currentAdjustmentFactor = newAdjustmentFactor;

                // Probation logic
                if (signalPerformance[source].recentAccuracy.length >= PROBATION_MIN_OBSERVATIONS && accuracy < PROBATION_THRESHOLD_ACCURACY) {
                    signalPerformance[source].isOnProbation = true;
                } else if (accuracy > PROBATION_THRESHOLD_ACCURACY + 0.15) {
                    signalPerformance[source].isOnProbation = false;
                }

                // Alpha factor (learning rate for adjustment factor)
                let alphaLearningRate = ALPHA_UPDATE_RATE;
                if (accuracy < 0.35) alphaLearningRate *= 1.75; // Learn faster if very bad
                else if (accuracy < 0.45) alphaLearningRate *= 1.4;

                if (newAdjustmentFactor > signalPerformance[source].alphaFactor) {
                    signalPerformance[source].alphaFactor = Math.min(MAX_ALPHA_FACTOR, signalPerformance[source].alphaFactor + alphaLearningRate * (newAdjustmentFactor - signalPerformance[source].alphaFactor));
                } else {
                    signalPerformance[source].alphaFactor = Math.max(MIN_ALPHA_FACTOR, signalPerformance[source].alphaFactor - alphaLearningRate * (signalPerformance[source].alphaFactor - newAdjustmentFactor));
                }
            }
            signalPerformance[source].lastActivePeriod = periodFull;
        }
        signalPerformance[source].lastUpdatePeriod = periodFull;
    });
}

/**
 * Detects concept drift in the prediction accuracy.
 * @param {boolean} isCorrect Whether the last prediction was correct.
 * @returns {string} 'STABLE', 'WARNING', or 'DRIFT'.
 */
function detectConceptDrift(isCorrect) {
    driftDetector.n++;
    const errorRate = isCorrect ? 0 : 1;
    // Incremental mean and standard deviation for error rate
    const p_i = (driftDetector.n > 1 ? driftDetector.p_i : 0) + (errorRate - (driftDetector.n > 1 ? driftDetector.p_i : 0)) / driftDetector.n;
    driftDetector.p_i = p_i;
    const s_i = Math.sqrt(p_i * (1 - p_i) / driftDetector.n);

    if (p_i + s_i < driftDetector.p_min + driftDetector.s_min) {
        driftDetector.p_min = p_i;
        driftDetector.s_min = s_i;
    }

    // Check for drift or warning based on standard deviations from minimum
    if (p_i + s_i > driftDetector.p_min + driftDetector.drift_level * driftDetector.s_min) {
        driftDetector.p_min = Infinity; // Reset for new window
        driftDetector.s_min = Infinity;
        driftDetector.n = 1;
        return 'DRIFT';
    } else if (p_i + s_i > driftDetector.p_min + driftDetector.warning_level * driftDetector.s_min) {
        return 'WARNING';
    } else {
        return 'STABLE';
    }
}

let REGIME_SIGNAL_PROFILES = {
    "TREND_STRONG_LOW_VOL": { baseWeightMultiplier: 1.30, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'volBreak', 'fusion', 'ml_standard'], contextualAggression: 1.35, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "TREND_STRONG_MED_VOL": { baseWeightMultiplier: 1.20, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'pattern', 'fusion', 'ml_standard'], contextualAggression: 1.25, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "TREND_STRONG_HIGH_VOL": { baseWeightMultiplier: 0.70, activeSignalTypes: ['trend', 'ichimoku', 'entropy', 'volPersist', 'fusion', 'ml_volatile'], contextualAggression: 0.70, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_LOW_VOL": { baseWeightMultiplier: 1.30, activeSignalTypes: ['meanRev', 'pattern', 'stochastic', 'bollinger'], contextualAggression: 1.30, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_MED_VOL": { baseWeightMultiplier: 1.15, activeSignalTypes: ['meanRev', 'pattern', 'stochastic', 'rsi', 'bollinger'], contextualAggression: 1.15, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_HIGH_VOL": { baseWeightMultiplier: 0.85, activeSignalTypes: ['meanRev', 'entropy', 'bollinger', 'volPersist', 'fusion', 'ml_volatile'], contextualAggression: 0.85, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "DEFAULT": { baseWeightMultiplier: 0.9, activeSignalTypes: ['all'], contextualAggression: 0.9, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 }
};
const REGIME_ACCURACY_WINDOW = 35;
const REGIME_LEARNING_RATE_BASE = 0.028;
let GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = 0.5;

/**
 * Simulates identifying a new, persistent market state and creating a strategy for it.
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {object} stability Current trend stability.
 * @param {object} sharedStats Shared state payload.
 * @returns {object} Updated Aurochs state.
 */
function discoverAndAdaptRegimes(history, trendContext, stability, sharedStats) {
    const CHOPPY_PERSISTENCE_THRESHOLD = 8;
    const aurochsState = sharedStats.aurochsState || { choppyCount: 0 };

    if (trendContext.volatility === "VERY_LOW" && stability.reason.includes("Choppiness")) {
        aurochsState.choppyCount++;
    } else {
        aurochsState.choppyCount = 0;
    }

    if (aurochsState.choppyCount >= CHOPPY_PERSISTENCE_THRESHOLD && !REGIME_SIGNAL_PROFILES["CUSTOM_AUROCHS_MODE"]) {
        console.log("!!! DYNAMIC REGIME DISCOVERY: New 'AUROCHS' mode identified. Creating profile. !!!");
        REGIME_SIGNAL_PROFILES["CUSTOM_AUROCHS_MODE"] = {
            baseWeightMultiplier: 1.40,
            activeSignalTypes: ['pattern', 'meanRev', 'stochastic', 'bollinger', 'uniquePattern'], // Add unique pattern to this custom regime
            contextualAggression: 1.50,
            recentAccuracy: [],
            totalPredictions: 0,
            correctPredictions: 0
        };
    }

    return aurochsState; // Return the updated state
}

/**
 * Updates the performance of market regime profiles.
 * @param {string} regime The current market regime.
 * @param {string} actualOutcome The actual outcome.
 * @param {string} predictedOutcome The predicted outcome.
 */
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

/**
 * Analyzes consensus among contributing signals.
 * @param {Array<object>} signals Array of signals with prediction and adjustedWeight.
 * @param {object} trendContext Current trend context.
 * @returns {object} Consensus score, factor, and details.
 */
function analyzePredictionConsensus(signals, trendContext) {
    if (!signals || signals.length < 4) {
        return { score: 0.5, factor: 1.0, details: "Insufficient signals for consensus" };
    }

    const categories = {
        trend: { BIG: 0, SMALL: 0, weight: 0 },
        momentum: { BIG: 0, SMALL: 0, weight: 0 },
        meanRev: { BIG: 0, SMALL: 0, weight: 0 },
        pattern: { BIG: 0, SMALL: 0, weight: 0 },
        ml: { BIG: 0, SMALL: 0, weight: 0 },
        numerical: { BIG: 0, SMALL: 0, weight: 0 }, // New category for jackpot analysis
        unique: { BIG: 0, SMALL: 0, weight: 0 }, // New category for unique/hard patterns
    };

    const getCategory = source => {
        if (source.includes("MACD") || source.includes("Ichimoku") || source.includes("Fusion") || source.includes("Trend")) return 'trend';
        if (source.includes("Stochastic") || source.includes("RSI")) return 'momentum';
        if (source.includes("Bollinger") || source.includes("StreakBreak")) return 'meanRev';
        if (source.includes("Alt") || source.includes("Pattern") || source.includes("Transition") || source.includes("BS_Pattern")) return 'pattern';
        if (source.includes("ML-") || source.includes("AI_LongData")) return 'ml';
        if (source.includes("Jackpot")) return 'numerical';
        if (source.includes("Unique_") || source.includes("HardPattern")) return 'unique';
        return null;
    };

    signals.forEach(s => {
        const category = getCategory(s.source);
        if (category && (s.prediction === "BIG" || s.prediction === "SMALL")) {
            categories[category][s.prediction] += s.adjustedWeight;
        }
    });

    let bigWeight = 0, smallWeight = 0;
    let bigCats = 0, smallCats = 0, mixedCats = 0;

    for(const cat of Object.values(categories)) {
        const totalWeight = cat.BIG + cat.SMALL;
        if (totalWeight > 0.001) {
            bigWeight += cat.BIG;
            smallWeight += cat.SMALL;
            if(cat.BIG > cat.SMALL * 1.5) bigCats++; // Higher threshold for clear category win
            else if (cat.SMALL > cat.BIG * 1.5) smallCats++;
            else mixedCats++;
        }
    }

    let consensusScore = 0.5;
    const totalCats = bigCats + smallCats + mixedCats;
    if(totalCats > 0) {
        const dominantCats = Math.max(bigCats, smallCats);
        const nonDominantCats = Math.min(bigCats, smallCats);
        consensusScore = (dominantCats - nonDominantCats) / totalCats; // Normalized score
    }

    let factor = 1.0 + (consensusScore * 0.5); // Boost factor for higher consensus

    // Penalty for conflicting major categories in strong trends
    if (trendContext.strength === 'STRONG') {
        if((categories.trend.BIG > categories.trend.SMALL && categories.momentum.SMALL > categories.momentum.BIG) ||
           (categories.trend.SMALL > categories.trend.BIG && categories.momentum.BIG > categories.momentum.SMALL)) {
            factor *= 0.6; // Heavy penalty for trend/momentum conflict
        }
    }

    return {
        score: consensusScore,
        factor: Math.max(0.4, Math.min(1.6, factor)),
        details: `Bcat:${bigCats},Scat:${smallCats},Mcat:${mixedCats},Score:${consensusScore.toFixed(2)}`
    };
}

/**
 * Assesses the quality of the signal set to produce a final, adjusted confidence level.
 * @param {string} preliminaryDecision The initial decision.
 * @param {Array<object>} signals Array of signals.
 * @param {object} consensus Consensus analysis result.
 * @param {string} driftState Current concept drift state.
 * @param {number} pqs Prediction Quality Score.
 * @returns {object} Final confidence level and reason.
 */
function analyzeConfidenceModel(preliminaryDecision, signals, consensus, driftState, pqs) {
    let confidenceLevel = 1; // Base level
    let confidenceReason = "Baseline";

    const agreeingSignals = signals.filter(s => s.prediction === preliminaryDecision);
    const disagreeingSignals = signals.filter(s => s.prediction && s.prediction !== preliminaryDecision);

    const agreeingWeight = agreeingSignals.reduce((sum, s) => sum + s.adjustedWeight, 0);
    const disagreeingWeight = disagreeingSignals.reduce((sum, s) => sum + s.adjustedWeight, 0);

    const weightRatio = agreeingWeight / (disagreeingWeight + 0.01); // Avoid division by zero

    // Level 2: Good Consensus & Weight Ratio
    if (consensus.score > 0.6 && weightRatio > 2.5 && pqs > 0.6) {
        confidenceLevel = 2;
        confidenceReason = "Good Consensus & Weight Ratio";
    }

    // Level 3: High-Conviction Consensus with ML Agreement
    if (consensus.score > 0.8 && weightRatio > 4.0 && pqs > 0.75 && driftState === 'STABLE') {
        const mlSignal = signals.find(s => s.source.startsWith("ML-") || s.source.startsWith("AI_LongData"));
        if (mlSignal && mlSignal.prediction === preliminaryDecision) {
            confidenceLevel = 3;
            confidenceReason = "High-Conviction Consensus with AI Agreement";
        }
    }

    // Overrides for high uncertainty
    if (driftState === 'DRIFT' || pqs < 0.25) {
        confidenceLevel = 1;
        confidenceReason = "Override: High Uncertainty/Drift";
    }

    return { finalConfidenceLevel: confidenceLevel, reason: confidenceReason };
}

/**
 * Analyzes the diversity and strength of agreeing signals (path confluence).
 * @param {Array<object>} signals Array of signals.
 * @param {string} finalPrediction The final predicted outcome.
 * @returns {object} Confluence score, diverse paths count, and details.
 */
function analyzePathConfluenceStrength(signals, finalPrediction) {
    if (!signals || signals.length === 0 || !finalPrediction) return { score: 0, diversePaths: 0, details: "No valid signals or prediction." };

    // Filter for strong, agreeing signals
    const agreeingSignals = signals.filter(s => s.prediction === finalPrediction && s.adjustedWeight > MIN_ABSOLUTE_WEIGHT * 10);
    if (agreeingSignals.length < 2) {
        return { score: 0, diversePaths: agreeingSignals.length, details: "Insufficient strong agreeing signals." };
    }

    const signalCategories = new Set();
    agreeingSignals.forEach(s => {
        // Map signal sources to broader categories
        if (s.source.includes("MACD") || s.source.includes("Ichimoku") || s.source.includes("Fusion") || s.source.includes("Trend")) signalCategories.add('trend');
        else if (s.source.includes("Stochastic") || s.source.includes("RSI") || s.source.includes("Momentum")) signalCategories.add('momentum');
        else if (s.source.includes("Bollinger") || s.source.includes("StreakBreak") || s.source.includes("Reversal")) signalCategories.add('meanRev');
        else if (s.source.includes("Alt") || s.source.includes("Pattern") || s.source.includes("Transition") || s.source.includes("BS_Pattern")) signalCategories.add('pattern');
        else if (s.source.includes("Vol") || s.source.includes("Entropy")) signalCategories.add('volatility');
        else if (s.source.includes("ML-") || s.source.includes("AI_LongData")) signalCategories.add('probabilistic');
        else if (s.source.includes("Jackpot") || s.source.includes("Numerical")) signalCategories.add('numerical');
        else if (s.source.includes("Unique_") || s.source.includes("HardPattern")) signalCategories.add('anomaly');
        else signalCategories.add('other');
    });

    const diversePathCount = signalCategories.size;
    let confluenceScore = 0;

    // Award score based on diversity of contributing categories
    if (diversePathCount >= 4) confluenceScore = 0.20;
    else if (diversePathCount === 3) confluenceScore = 0.12;
    else if (diversePathCount === 2) confluenceScore = 0.05;

    // Add score based on number of very strong individual signals
    const veryStrongAgreeingCount = agreeingSignals.filter(s => s.adjustedWeight > 0.10).length;
    confluenceScore += Math.min(veryStrongAgreeingCount * 0.02, 0.10); // Cap additional score

    return { score: Math.min(confluenceScore, 0.30), diversePaths: diversePathCount, details: `Paths:${diversePathCount},Strong:${veryStrongAgreeingCount}` };
}

/**
 * Analyzes the consistency of signals (how many agree vs. disagree).
 * @param {Array<object>} signals Array of signals.
 * @param {object} trendContext Current trend context.
 * @returns {object} Consistency score and details.
 */
function analyzeSignalConsistency(signals, trendContext) {
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

let consecutiveHighConfLosses = 0;
let reflexiveCorrectionActive = 0;

/**
 * Checks for anomalous performance (e.g., consecutive high-confidence losses)
 * and activates reflexive correction if needed.
 * @param {object} currentSharedStats Current shared state.
 * @returns {boolean} True if reflexive correction is active.
 */
function checkForAnomalousPerformance(currentSharedStats) {
    if (reflexiveCorrectionActive > 0) {
        reflexiveCorrectionActive--; // Countdown
        return true;
    }

    if (currentSharedStats && typeof currentSharedStats.lastFinalConfidence === 'number' && currentSharedStats.lastActualOutcome) {
        const lastPredOutcomeBS = getBigSmallFromNumber(currentSharedStats.lastActualOutcome);
        const lastPredWasCorrect = lastPredOutcomeBS === currentSharedStats.lastPredictedOutcome;

        const lastPredWasHighConf = currentSharedStats.lastConfidenceLevel === 3;

        if (lastPredWasHighConf && !lastPredWasCorrect) {
            consecutiveHighConfLosses++;
        } else {
            consecutiveHighConfLosses = 0;
        }
    }

    if (consecutiveHighConfLosses >= 2) { // 2 consecutive high-confidence losses
        reflexiveCorrectionActive = 5; // Activate for next 5 periods
        consecutiveHighConfLosses = 0; // Reset counter
        return true;
    }

    return false;
}

/**
 * Calculates an overall uncertainty score based on various market and signal health metrics.
 * @param {object} trendContext Current trend context.
 * @param {object} stability Current trend stability.
 * @param {object} marketEntropyState Current market entropy state.
 * @param {object} signalConsistency Signal consistency analysis result.
 * @param {object} pathConfluence Path confluence analysis result.
 * @param {number} globalAccuracy Global long-term accuracy.
 * @param {boolean} isReflexiveCorrection Whether reflexive correction is active.
 * @param {string} driftState Current concept drift state.
 * @returns {object} Uncertainty score and reasons.
 */
function calculateUncertaintyScore(trendContext, stability, marketEntropyState, signalConsistency, pathConfluence, globalAccuracy, isReflexiveCorrection, driftState) {
    let uncertaintyScore = 0;
    let reasons = [];

    if (isReflexiveCorrection) {
        uncertaintyScore += 80; // High penalty for active correction
        reasons.push("ReflexiveCorrection");
    }
    if(driftState === 'DRIFT') {
        uncertaintyScore += 70; // High penalty for concept drift
        reasons.push("ConceptDrift");
    } else if (driftState === 'WARNING') {
        uncertaintyScore += 40; // Moderate penalty for drift warning
        reasons.push("DriftWarning");
    }
    if (!stability.isStable) {
        uncertaintyScore += (stability.reason.includes("Dominance") || stability.reason.includes("Choppiness")) ? 50 : 40;
        reasons.push(`Instability:${stability.reason}`);
    }
    if (marketEntropyState.state.includes("CHAOS")) {
        uncertaintyScore += marketEntropyState.state === "RISING_CHAOS" ? 45 : 35;
        reasons.push(marketEntropyState.state);
    }
    if (signalConsistency.score < 0.6) {
        uncertaintyScore += (1 - signalConsistency.score) * 50; // Higher penalty for lower consistency
        reasons.push(`LowConsistency:${signalConsistency.score.toFixed(2)}`);
    }
    if (pathConfluence.diversePaths < 3) {
        uncertaintyScore += (3 - pathConfluence.diversePaths) * 15; // Penalty for less diverse signals
        reasons.push(`LowConfluence:${pathConfluence.diversePaths}`);
    }
    if (trendContext.isTransitioning) {
        uncertaintyScore += 25; // Penalty during regime transitions
        reasons.push("RegimeTransition");
    }
    if (trendContext.volatility === "HIGH") {
        uncertaintyScore += 20; // Penalty for high volatility
        reasons.push("HighVolatility");
    }
     if (typeof globalAccuracy === 'number' && globalAccuracy < 0.48) {
        uncertaintyScore += (0.48 - globalAccuracy) * 150; // Penalty for low global accuracy
        reasons.push(`LowGlobalAcc:${globalAccuracy.toFixed(2)}`);
    }

    return { score: uncertaintyScore, reasons: reasons.join(';') };
}

/**
 * Creates a feature set for ML models based on historical data and context.
 * @param {Array<object>} history Historical data.
 * @param {object} trendContext Current trend context.
 * @param {object} time Current time features.
 * @returns {object|null} Feature set or null if insufficient data.
 */
function createFeatureSetForML(history, trendContext, time) {
    const numbers = history.map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));
    if(numbers.length < 52) return null; // Need sufficient history for various indicators

    // Calculate indicators needed for ML features
    const rsi_14 = calculateRSI(numbers, 14);
    const macdResult = analyzeMACD(history, 12, 26, 9, 1.0);
    const stddev_10 = calculateStdDev(numbers, 10);
    const stddev_30 = calculateStdDev(numbers, 30);
    const stochResult = analyzeStochastic(history, 14, 3, 3, 1.0, trendContext.volatility);

    if (rsi_14 === null || macdResult === null || stddev_10 === null || stddev_30 === null || stochResult === null) {
        return null; // Ensure all required features are calculable
    }

    return {
        time_sin: time.sin,
        time_cos: time.cos,
        last_5_mean: calculateSMA(numbers, 5),
        last_20_mean: calculateSMA(numbers, 20),
        stddev_10: stddev_10,
        stddev_30: stddev_30,
        rsi_14: rsi_14,
        stoch_k_14: stochResult.currentK, // Assuming currentK is available on stochastic result
        macd_hist: macdResult.macdHistogram, // Assuming macdHistogram is available on macd result
        trend_strength: trendContext.strength === 'STRONG' ? 2 : (trendContext.strength === 'MODERATE' ? 1 : 0),
        volatility_level: trendContext.volatility === 'HIGH' ? 2 : (trendContext.volatility === 'MEDIUM' ? 1 : 0),
    };
}


// --- Main Prediction Function (10. The Main Quantum AI Data Processor) ---
/**
 * The main Quantum AI Supercore prediction engine. Orchestrates all analytical modules,
 * fuses signals, and provides a final prediction with confidence.
 * @param {Array} currentSharedHistory - The historical data for predictions.
 * @param {object} sharedStatsPayload - The complete state object from the previous run.
 * @returns {object} An object containing the prediction and the updated state.
 */
function ultraAIPredict(currentSharedHistory, sharedStatsPayload = {}) {
    let currentSharedStats = sharedStatsPayload;

    const currentPeriodFull = Date.now();
    const time = getCurrentISTHour();

    // --- Synchronous Data Simulation ---
    const realTimeData = getRealTimeExternalData();

    console.log(`Quantum AI Supercore v44.3.0 Initializing Prediction for period ${currentPeriodFull}`);
    let masterLogic = [`QAScore_v44.3(IST_Hr:${time.raw})`];
    masterLogic.push(realTimeData.reason);

    // --- Dynamic & Adaptive Setup ---
    const trendContext = getMarketRegimeAndTrendContext(currentSharedHistory);
    const stability = analyzeTrendStability(currentSharedHistory);
    const updatedAurochsState = discoverAndAdaptRegimes(currentSharedHistory, trendContext, stability, currentSharedStats);

    // Check if a new regime was discovered and re-evaluate trend context
    let finalTrendContext = getMarketRegimeAndTrendContext(currentSharedHistory);
    if (updatedAurochsState.choppyCount >= 8) {
       finalTrendContext.macroRegime = "CUSTOM_AUROCHS_MODE"; // Override regime if custom mode detected
    }

    const primeTimeSession = getPrimeTimeSession(time.raw);
    if (primeTimeSession) {
        masterLogic.push(`!!! PRIME TIME ACTIVE: ${primeTimeSession.session} !!!`);
    }

    let longTermGlobalAccuracy = currentSharedStats?.longTermGlobalAccuracy || GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE;
    if (currentSharedStats && typeof currentSharedStats.longTermGlobalAccuracy === 'number') {
        GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = currentSharedStats.longTermGlobalAccuracy;
    }

    const isReflexiveCorrection = checkForAnomalousPerformance(currentSharedStats);
    if (isReflexiveCorrection) {
        masterLogic.push(`!!! REFLEXIVE CORRECTION ACTIVE !!! (Countdown: ${reflexiveCorrectionActive})`);
    }

    masterLogic.push(`TrendCtx(Dir:${finalTrendContext.direction},Str:${finalTrendContext.strength},Vol:${finalTrendContext.volatility},Regime:${finalTrendContext.macroRegime})`);

    const marketEntropyAnalysis = analyzeMarketEntropyState(currentSharedHistory, finalTrendContext, stability);
    masterLogic.push(`MarketEntropy:${marketEntropyAnalysis.state}`);

    const advancedRegime = analyzeAdvancedMarketRegime(finalTrendContext, marketEntropyAnalysis);
    masterLogic.push(`AdvRegime:${advancedRegime.details}`);

    let concentrationModeEngaged = !stability.isStable || isReflexiveCorrection || marketEntropyAnalysis.state.includes("CHAOS");

    let driftState = 'STABLE';
    if (currentSharedStats && typeof currentSharedStats.lastActualOutcome !== 'undefined') {
        const lastPredictionWasCorrect = getBigSmallFromNumber(currentSharedStats.lastActualOutcome) === currentSharedStats.lastPredictedOutcome;
        driftState = detectConceptDrift(lastPredictionWasCorrect);
        if (driftState !== 'STABLE') {
            masterLogic.push(`!!! DRIFT DETECTED: ${driftState} !!!`);
            concentrationModeEngaged = true;
        }
    }

    if (concentrationModeEngaged) masterLogic.push(`ConcentrationModeActive`);

    const currentVolatilityRegimeForPerf = finalTrendContext.volatility;
    const currentMacroRegime = finalTrendContext.macroRegime;

    // Update performance of signals and regimes based on last outcome
    if (currentSharedStats && currentSharedStats.lastPredictionSignals && currentSharedStats.lastActualOutcome) {
        updateSignalPerformance(
            currentSharedStats.lastPredictionSignals,
            getBigSmallFromNumber(currentSharedStats.lastActualOutcome),
            currentSharedStats.lastPeriodFull,
            currentSharedStats.lastVolatilityRegime || currentVolatilityRegimeForPerf,
            currentSharedStats.lastFinalConfidence,
            currentSharedStats.lastConcentrationModeEngaged || false,
            currentSharedStats.lastMarketEntropyState || "STABLE_MODERATE"
        );
        if (currentSharedStats.lastPredictedOutcome) {
            updateRegimeProfilePerformance(currentSharedStats.lastMacroRegime, getBigSmallFromNumber(currentSharedStats.lastActualOutcome), currentSharedStats.lastPredictedOutcome);
        }
    }

    const confirmedHistory = currentSharedHistory.filter(p => p && p.actual !== null && p.actualNumber !== undefined);
    // Minimum history for comprehensive analysis
    if (confirmedHistory.length < 52) { // Increased minimum history for new modules
        masterLogic.push(`InsufficientHistory_ForceRandom`);
        const finalDecision = Math.random() > 0.5 ? "BIG" : "SMALL";
        const predictionOutput = {
            predictions: { BIG: { confidence: 0.5, logic: "ForcedRandom" }, SMALL: { confidence: 0.5, logic: "ForcedRandom" } },
            finalDecision: finalDecision, finalConfidence: 0.5, confidenceLevel: 1, isForcedPrediction: true,
            overallLogic: masterLogic.join(' -> '), source: "InsufficientHistory",
        };
        const newState = {
            ...currentSharedStats,
            lastPredictedOutcome: finalDecision, lastFinalConfidence: 0.5, lastConfidenceLevel: 1, lastMacroRegime: currentMacroRegime,
            lastPredictionSignals: [], lastConcentrationModeEngaged: concentrationModeEngaged,
            lastMarketEntropyState: marketEntropyAnalysis.state, lastVolatilityRegime: finalTrendContext.volatility, periodFull: currentPeriodFull,
            aurochsState: updatedAurochsState
        };
        return sanitizeForFirebase(predictionOutput);
    }

    let signals = [];
    const currentRegimeProfile = REGIME_SIGNAL_PROFILES[currentMacroRegime] || REGIME_SIGNAL_PROFILES["DEFAULT"];
    let regimeContextualAggression = (currentRegimeProfile.contextualAggression || 1.0) * (primeTimeSession?.aggression || 1.0);

    if (isReflexiveCorrection || driftState === 'DRIFT') regimeContextualAggression *= 0.25;
    else if (concentrationModeEngaged) regimeContextualAggression *= 0.6;

    // --- Combined Signal Generation from all 9 Engines ---
    const signalGenerators = [
        // Core Analytical Modules (Existing)
        () => analyzeTransitions(confirmedHistory, 0.05),
        () => analyzeStreaks(confirmedHistory, 0.045),
        () => analyzeAlternatingPatterns(confirmedHistory, 0.06),
        () => analyzeRSI(confirmedHistory, 14, 0.08, finalTrendContext.volatility),
        () => analyzeMACD(confirmedHistory, 12, 26, 9, 0.09),
        () => analyzeBollingerBands(confirmedHistory, 20, 2.1, 0.07),
        () => analyzeIchimokuCloud(confirmedHistory, 9, 26, 52, 0.14),
        () => analyzeStochastic(confirmedHistory, 14, 3, 3, 0.08, finalTrendContext.volatility),
        () => analyzeVolatilityTrendFusion(finalTrendContext, marketEntropyAnalysis, 0.25),

        // New Specialized Modules (User Requested)
        () => analyzeShortTermTrendPatterns(confirmedHistory, 0.10), // 1. Shot Trend
        () => analyzeLongTermTrendPatterns(confirmedHistory, 0.12),  // 2. Long Trend
        () => detectAnyPattern(confirmedHistory, 0.07),             // 3. General Pattern
        () => analyzeReversalPatterns(confirmedHistory, 0.15, finalTrendContext.volatility), // 4. Reversal Patterns
        () => analyzeAIPoweredLongData(confirmedHistory, finalTrendContext, time, 0.20), // 5. AI-Powered Long Data
        () => findUniquePatternsAndAnomalies(confirmedHistory, 0.18), // 6. Unique Patterns & Anomalies
        () => classifyBigSmallPatterns(confirmedHistory, 0.10),     // 7. Big/Small Patterns
        () => analyzeRecentJackpotNumbers(confirmedHistory, 0.12),  // 8. Recent Jackpot Numbers
        () => identifyHardPatterns(confirmedHistory, finalTrendContext, marketEntropyAnalysis, 0.16) // 9. Hard Patterns
    ];

    // Filter signal generators based on current regime's active signal types (if specified)
    const activeSignalTypes = currentRegimeProfile.activeSignalTypes;
    const filteredSignalGenerators = signalGenerators.filter(gen => {
        // Simple check: if 'all' is active, include all. Otherwise, check source keywords.
        if (activeSignalTypes.includes('all')) return true;
        const sourceName = gen.name; // Function name as a proxy for source
        if (sourceName.includes('Trend') && activeSignalTypes.includes('trend')) return true;
        if (sourceName.includes('Momentum') && activeSignalTypes.includes('momentum')) return true;
        if (sourceName.includes('MeanRev') && activeSignalTypes.includes('meanRev')) return true;
        if (sourceName.includes('Pattern') && activeSignalTypes.includes('pattern')) return true;
        if (sourceName.includes('MLModel') && activeSignalTypes.includes('ml_standard')) return true; // For ML standard
        if (sourceName.includes('Volatile') && activeSignalTypes.includes('ml_volatile')) return true; // For ML volatile
        if (sourceName.includes('Ichimoku') && activeSignalTypes.includes('ichimoku')) return true;
        if (sourceName.includes('MACD') && activeSignalTypes.includes('momentum')) return true; // MACD is also momentum
        if (sourceName.includes('Bollinger') && activeSignalTypes.includes('meanRev')) return true;
        if (sourceName.includes('Stochastic') && activeSignalTypes.includes('momentum')) return true;
        if (sourceName.includes('Fusion') && activeSignalTypes.includes('fusion')) return true;
        if (sourceName.includes('VolatilityBreakout') && activeSignalTypes.includes('volBreak')) return true;
        if (sourceName.includes('Entropy') && activeSignalTypes.includes('entropy')) return true;
        if (sourceName.includes('VolPersist') && activeSignalTypes.includes('volPersist')) return true;
        if (sourceName.includes('Reversal') && activeSignalTypes.includes('reversal')) return true; // New
        if (sourceName.includes('AI_LongData') && activeSignalTypes.includes('ai_long_data')) return true; // New
        if (sourceName.includes('UniquePattern') && activeSignalTypes.includes('uniquePattern')) return true; // New
        if (sourceName.includes('BigSmallPattern') && activeSignalTypes.includes('bigSmallPattern')) return true; // New
        if (sourceName.includes('JackpotNumbers') && activeSignalTypes.includes('jackpotNumbers')) return true; // New
        if (sourceName.includes('HardPattern') && activeSignalTypes.includes('hardPattern')) return true; // New

        return false;
    });


    filteredSignalGenerators.forEach(gen => {
        const result = gen();
        if (result && result.weight && result.prediction) {
            result.adjustedWeight = getDynamicWeightAdjustment(result.source, result.weight * regimeContextualAggression, currentPeriodFull, currentVolatilityRegimeForPerf, currentSharedHistory);
            signals.push(result);
        }
    });

    const validSignals = signals.filter(s => s?.prediction && s.adjustedWeight > MIN_ABSOLUTE_WEIGHT);
    masterLogic.push(`ValidSignals(${validSignals.length}/${signals.length})`);

    if (validSignals.length === 0) {
        masterLogic.push(`NoValidSignals_ForceRandom`);
        const finalDecision = Math.random() > 0.5 ? "BIG" : "SMALL";
        const predictionOutput = {
            predictions: { BIG: { confidence: 0.5, logic: "ForcedRandom" }, SMALL: { confidence: 0.5, logic: "ForcedRandom" } },
            finalDecision: finalDecision, finalConfidence: 0.5, confidenceLevel: 1, isForcedPrediction: true,
            overallLogic: masterLogic.join(' -> '), source: "NoValidSignals",
        };
         const newState = {
            ...currentSharedStats,
            lastPredictedOutcome: finalDecision, lastFinalConfidence: 0.5, lastConfidenceLevel: 1, lastMacroRegime: currentMacroRegime,
            lastPredictionSignals: [], lastConcentrationModeEngaged: concentrationModeEngaged,
            lastMarketEntropyState: marketEntropyAnalysis.state, lastVolatilityRegime: finalTrendContext.volatility, periodFull: currentPeriodFull,
            aurochsState: updatedAurochsState
        };
        return sanitizeForFirebase(predictionOutput);
    }

    const consensus = analyzePredictionConsensus(validSignals, finalTrendContext);
    masterLogic.push(`Consensus:${consensus.details},Factor:${consensus.factor.toFixed(2)}`);

    let bigScore = 0; let smallScore = 0;
    validSignals.forEach(signal => {
        if (signal.prediction === "BIG") bigScore += signal.adjustedWeight;
        else if (signal.prediction === "SMALL") smallScore += signal.adjustedWeight;
    });

    // Apply advanced regime probabilities to scores
    bigScore *= (1 + advancedRegime.probabilities.bullTrend - advancedRegime.probabilities.bearTrend);
    smallScore *= (1 + advancedRegime.probabilities.bearTrend - advancedRegime.probabilities.bullTrend);

    // Apply consensus factor to scores
    bigScore *= consensus.factor;
    smallScore *= (2.0 - consensus.factor); // Inverse factor for the opposite outcome

    const totalScore = bigScore + smallScore;
    let finalDecision = totalScore > 0 ? (bigScore >= smallScore ? "BIG" : "SMALL") : (Math.random() > 0.5 ? "BIG" : "SMALL");
    let finalConfidence = totalScore > 0 ? Math.max(bigScore, smallScore) / totalScore : 0.5;

    // Adjust confidence based on prime time and real-time external data
    finalConfidence = 0.5 + (finalConfidence - 0.5) * (primeTimeSession?.confidence || 1.0) * realTimeData.factor;

    // Analyze signal consistency and path confluence for overall prediction quality
    const signalConsistency = analyzeSignalConsistency(validSignals, finalTrendContext);
    const pathConfluence = analyzePathConfluenceStrength(validSignals, finalDecision);
    const uncertainty = calculateUncertaintyScore(finalTrendContext, stability, marketEntropyAnalysis, signalConsistency, pathConfluence, longTermGlobalAccuracy, isReflexiveCorrection, driftState);

    // Adjust final confidence based on uncertainty
    const uncertaintyFactor = 1.0 - Math.min(1.0, uncertainty.score / 120.0); // Normalize uncertainty score
    finalConfidence = 0.5 + (finalConfidence - 0.5) * uncertaintyFactor;
    masterLogic.push(`Uncertainty(Score:${uncertainty.score.toFixed(0)},Factor:${uncertaintyFactor.toFixed(2)})`);

    // Calculate Prediction Quality Score (PQS)
    let pqs = 0.5;
    pqs += (signalConsistency.score - 0.5) * 0.4;
    pqs += pathConfluence.score * 1.2;
    pqs = Math.max(0.01, Math.min(0.99, pqs - (uncertainty.score / 500))); // Deduct uncertainty from PQS
    masterLogic.push(`PQS:${pqs.toFixed(3)}`);

    // Analyze confidence model for final confidence level
    const confidenceModelResult = analyzeConfidenceModel(finalDecision, validSignals, consensus, driftState, pqs);
    let confidenceLevel = confidenceModelResult.finalConfidenceLevel;
    masterLogic.push(`ConfModel(L${confidenceLevel}-${confidenceModelResult.reason})`);

    // Force prediction to low confidence if uncertainty is too high or PQS is too low
    const uncertaintyThreshold = isReflexiveCorrection || driftState === 'DRIFT' ? 65 : 95;
    const isForced = uncertainty.score >= uncertaintyThreshold || pqs < 0.20;
    if(isForced) {
        confidenceLevel = 1;
        finalConfidence = 0.5 + (Math.random() - 0.5) * 0.02; // Randomize slightly around 0.5
        masterLogic.push(`FORCED_PREDICTION(Uncertainty:${uncertainty.score}/${uncertaintyThreshold},PQS:${pqs})`);
    }

    // Ensure display confidence is correctly aligned with final decision
    const bigDisplayConfidence = finalDecision === "BIG" ? finalConfidence : 1 - finalConfidence;
    const smallDisplayConfidence = finalDecision === "SMALL" ? finalConfidence : 1 - finalConfidence;

    const predictionOutput = {
        predictions: {
            BIG: { confidence: Math.max(0.001, Math.min(0.999, bigDisplayConfidence)), logic: "EnsembleV44" },
            SMALL: { confidence: Math.max(0.001, Math.min(0.999, smallDisplayConfidence)), logic: "EnsembleV44" }
        },
        finalDecision,
        finalConfidence,
        confidenceLevel,
        isForcedPrediction: isForced,
        overallLogic: masterLogic.join(' -> '),
        source: "SimulationFusionV44.3",
        contributingSignals: validSignals.map(s => ({ source: s.source, prediction: s.prediction, weight: s.adjustedWeight.toFixed(5) })).sort((a,b)=>b.weight-a.weight).slice(0, 15),
    };

    // This part is for the calling environment to persist the state for the next run.
    // The main function returns only the prediction object.
    const newState = {
        lastPredictedOutcome: finalDecision,
        lastFinalConfidence: finalConfidence,
        lastConfidenceLevel: confidenceLevel,
        lastMacroRegime: currentMacroRegime,
        lastPredictionSignals: validSignals.map(s => ({ source: s.source, prediction: s.prediction, weight: s.adjustedWeight, isOnProbation: s.isOnProbation || false })),
        lastConcentrationModeEngaged: concentrationModeEngaged,
        lastMarketEntropyState: marketEntropyAnalysis.state,
        lastVolatilityRegime: finalTrendContext.volatility,
        periodFull: currentPeriodFull,
        aurochsState: updatedAurochsState,
        longTermGlobalAccuracy: longTermGlobalAccuracy // Persist this value
    };

    // This is a key change: update the shared stats object that was passed in.
    // Assumes the calling environment will persist this object.
    Object.assign(sharedStatsPayload, newState);

    console.log(`QAScore v44.3.0 Output: ${predictionOutput.finalDecision} @ ${(predictionOutput.finalConfidence * 100).toFixed(1)}% | Lvl: ${predictionOutput.confidenceLevel} | PQS: ${pqs.toFixed(2)} | Drift: ${driftState}`);

    return sanitizeForFirebase(predictionOutput);
}


if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        ultraAIPredict: ultraAIPredict,
        getBigSmallFromNumber,
        // Make stateful components accessible for external management if needed
        signalPerformance,
        REGIME_SIGNAL_PROFILES
    };
}
