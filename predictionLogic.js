// predictionLogic.js - Quantum AI Supercore Engine
// Version: 46.0.3 - Production Ready with Enhanced AI and Confidence Dynamics
// Changelog v46.0.3:
// - MODIFIED: Increased MAX_WEIGHT_FACTOR and ALPHA_UPDATE_RATE for more dynamic signal weight adjustments.
// - MODIFIED: Uncertainty modulation now incorporates Prediction Quality Score (PQS) for finer control.
// - ADDED: Contextual Signal Boosting/Suppression based on marketEntropyState and trendContext.
// - ADDED: Global getSignalCategory helper for consistent signal categorization.
// - IMPROVED: Enhanced comments and logging for new features.

let isMlModelLoading = false; // Simple flag to indicate if an ML prediction is in progress

// --- Helper Functions ---
function getBigSmallFromNumber(number) {
    if (number === undefined || number === null) return null;
    const num = parseInt(number);
    if (isNaN(num)) return null;
    return num >= 0 && num <= 4 ? 'SMALL' : num >= 5 && num <= 9 ? 'BIG' : null;
}

function getOppositeOutcome(prediction) {
    return prediction === "BIG" ? "SMALL" : prediction === "SMALL" ? "BIG" : null;
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

    const initialSliceForSma = chronologicalData.slice(0, period);
    if (initialSliceForSma.length < period) {
        // Fallback for insufficient data for initial SMA, take average of available
        if (initialSliceForSma.length === 0) return null;
        let ema = initialSliceForSma.reduce((a, b) => a + b, 0) / initialSliceForSma.length;
        for (let i = period; i < chronologicalData.length; i++) {
            ema = (chronologicalData[i] * k) + (ema * (1 - k));
        }
        return ema;
    }

    let ema = calculateSMA(initialSliceForSma.slice().reverse(), period);
    if (ema === null) return null; // Should not happen if initialSliceForSma.length >= period

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

function calculateVWAP(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    const relevantData = data.slice(0, period);
    let totalPriceVolume = 0;
    let totalVolume = 0;
    for (const entry of relevantData) {
        const price = parseFloat(entry.actualNumber);
        const volume = parseFloat(entry.volume || 1);
        if (!isNaN(price) && !isNaN(volume) && volume > 0) {
            totalPriceVolume += price * volume;
            totalVolume += volume;
        }
    }
    if (totalVolume === 0) return null;
    return totalPriceVolume / totalVolume;
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
        if (hour === 24) hour = 0;

        return {
            raw: hour,
            sin: Math.sin(hour / 24 * 2 * Math.PI),
            cos: Math.cos(hour / 24 * 2 * Math.PI)
        };
    } catch (error) {
        console.error("Error getting IST hour:", error);
        const hour = new Date().getHours(); // Fallback to local hour
        return {
             raw: hour,
             sin: Math.sin(hour / 24 * 2 * Math.PI),
             cos: Math.cos(hour / 24 * 2 * Math.PI)
        };
    }
}

function getRealTimeExternalData() {
    try {
        // Simulate external API call
        if (Math.random() < 0.1) {
            throw new Error("Simulated API failure for external data.");
        }
        
        const weatherConditions = ["Clear", "Clouds", "Haze", "Smoke", "Rain", "Drizzle"];
        const randomWeather = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
        let weatherFactor = 1.0;
        if (["Clear", "Clouds"].includes(randomWeather)) weatherFactor = 1.01;
        else if (["Rain", "Drizzle"].includes(randomWeather)) weatherFactor = 0.99;

        const newsSentiments = ["Strongly Positive", "Positive", "Neutral", "Negative", "Strongly Negative"];
        const randomNewsSentiment = newsSentiments[Math.floor(Math.random() * newsSentiments.length)];
        let newsFactor = 1.0;
        if(randomNewsSentiment === "Strongly Positive") newsFactor = 1.05;
        else if(randomNewsSentiment === "Positive") newsFactor = 1.02;
        else if(randomNewsSentiment === "Negative") newsFactor = 0.98;
        else if(randomNewsSentiment === "Strongly Negative") newsFactor = 0.95;

        const marketVolatilities = ["Low", "Normal", "Elevated", "High"];
        const randomMarketVol = marketVolatilities[Math.floor(Math.random() * marketVolatilities.length)];
        let marketVolFactor = 1.0;
        if(randomMarketVol === "Elevated") marketVolFactor = 0.97;
        else if(randomMarketVol === "High") marketVolFactor = 0.94;

        const combinedFactor = weatherFactor * newsFactor * marketVolFactor;
        const reason = `ExtData(Weather:${randomWeather},News:${randomNewsSentiment},MktVol:${randomMarketVol})`;

        return { factor: combinedFactor, reason: reason };
    } catch (error) {
        console.warn("Could not fetch real-time external data:", error.message);
        return null; 
    }
}

function getPrimeTimeSession(istHour) {
    if (istHour >= 10 && istHour < 12) return { session: "PRIME_MORNING", aggression: 1.25, confidence: 1.15 };
    if (istHour >= 13 && istHour < 14) return { session: "PRIME_AFTERNOON_1", aggression: 1.15, confidence: 1.10 };
    if (istHour >= 15 && istHour < 16) return { session: "PRIME_AFTERNOON_2", aggression: 1.15, confidence: 1.10 };
    if (istHour >= 17 && istHour < 20) {
        if (istHour === 19) {
             return { session: "PRIME_EVENING_PEAK", aggression: 1.35, confidence: 1.25 };
        }
        return { session: "PRIME_EVENING", aggression: 1.30, confidence: 1.20 };
    }
    return null; 
}


// --- Market Context Analysis ---
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
    const epsilon = 0.001; // Small value to prevent division by zero
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
    // Use a shorter period for volatility calculation to capture recent changes
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


// --- Core Analytical Modules ---
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
    if (!lastOutcome || !transitions[lastOutcome] || transitions[lastOutcome].total < 6) return null; // Need enough observations for a reliable transition
    const nextBigProb = transitions[lastOutcome]["BIG"] / transitions[lastOutcome].total;
    const nextSmallProb = transitions[lastOutcome]["SMALL"] / transitions[lastOutcome].total;
    if (nextBigProb > nextSmallProb + 0.30) return { prediction: "BIG", weight: baseWeight * nextBigProb, source: "Transition" };
    if (nextSmallProb > nextBigProb + 0.30) return { prediction: "SMALL", weight: baseWeight * nextSmallProb, source: "Transition" };
    return null;
}

function analyzeStreaks(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 3) return null;
    const actuals = history.map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (actuals.length < 3) return null;
    let currentStreakType = actuals[0], currentStreakLength = 0;
    for (const outcome of actuals) {
        if (outcome === currentStreakType) currentStreakLength++; else break;
    }
    if (currentStreakLength >= 2) { // Look for streaks of 2 or more
        const prediction = getOppositeOutcome(currentStreakType); // Predict a break in the streak
        // Weight factor increases with streak length, capping at a certain point
        const weightFactor = Math.min(0.45 + (currentStreakLength * 0.18), 0.95);
        return { prediction, weight: baseWeight * weightFactor, source: `StreakBreak-${currentStreakLength}` };
    }
    return null;
}

function analyzeAlternatingPatterns(history, baseWeight) {
    if (!Array.isArray(history) || history.length < 5) return null;
    const actuals = history.slice(0, 5).map(p => getBigSmallFromNumber(p.actual)).filter(bs => bs);
    if (actuals.length < 4) return null; // Need at least 4 for the patterns
    if (actuals[0] === "SMALL" && actuals[1] === "BIG" && actuals[2] === "SMALL" && actuals[3] === "BIG")
        return { prediction: "SMALL", weight: baseWeight * 1.15, source: "Alt-BSBS->S" };
    if (actuals[0] === "BIG" && actuals[1] === "SMALL" && actuals[2] === "BIG" && actuals[3] === "SMALL")
        return { prediction: "BIG", weight: baseWeight * 1.15, source: "Alt-SBSB->B" };
    return null;
}

function analyzeWeightedHistorical(history, weightDecayFactor, baseWeight) {
    if (!Array.isArray(history) || history.length < 5) return null;
    let bigWeightedScore = 0, smallWeightedScore = 0, currentWeight = 1.0;
    const maxHistory = Math.min(history.length, 20); // Limit to recent history for relevance
    for (let i = 0; i < maxHistory; i++) {
        const outcome = getBigSmallFromNumber(history[i].actual);
        if (outcome === "BIG") bigWeightedScore += currentWeight;
        else if (outcome === "SMALL") smallWeightedScore += currentWeight;
        currentWeight *= weightDecayFactor; // Decay weight for older data
    }
    if (bigWeightedScore === 0 && smallWeightedScore === 0) return null;
    const totalScore = bigWeightedScore + smallWeightedScore + 0.0001; // Add epsilon to prevent division by zero
    if (bigWeightedScore > smallWeightedScore) return { prediction: "BIG", weight: baseWeight * (bigWeightedScore / totalScore), source: "WeightedHist" };
    if (smallWeightedScore > bigWeightedScore) return { prediction: "SMALL", weight: baseWeight * (smallWeightedScore / totalScore), source: "WeightedHist" };
    return null;
}

function analyzeTwoPlusOnePatterns(history, baseWeight) {
    if (!history || history.length < 3) return null;
    const outcomes = history.slice(0, 3).map(p => getBigSmallFromNumber(p.actual));
    if (outcomes.some(o => o === null)) return null;

    const pattern = outcomes.join('');
    if (pattern === 'BBS') return { prediction: 'BIG', weight: baseWeight * 0.85, source: 'Pattern-BBS->B' };
    if (pattern === 'SSB') return { prediction: 'SMALL', weight: baseWeight * 0.85, source: 'Pattern-SSB->S' };

    return null;
}

function analyzeDoublePatterns(history, baseWeight) {
    if (!history || history.length < 4) return null;
    const outcomes = history.slice(0, 4).map(p => getBigSmallFromNumber(p.actual));
    if (outcomes.some(o => o === null)) return null;

    if (outcomes[0] === 'BIG' && outcomes[1] === 'BIG' && outcomes[2] === 'SMALL' && outcomes[3] === 'SMALL') {
        return { prediction: 'BIG', weight: baseWeight * 1.1, source: 'Pattern-SSBB->B' }; // Predict continuation of the double
    }
    if (outcomes[0] === 'SMALL' && outcomes[1] === 'SMALL' && outcomes[2] === 'BIG' && outcomes[3] === 'BIG') {
        return { prediction: 'SMALL', weight: baseWeight * 1.1, source: 'Pattern-BBSS->S' }; // Predict continuation of the double
    }
    return null;
}

function analyzeMirrorPatterns(history, baseWeight) {
    if (!history || history.length < 4) return null;
    const outcomes = history.slice(0, 4).map(p => getBigSmallFromNumber(p.actual));
    if (outcomes.some(o => o === null)) return null;

    // Check for A B B A pattern where A != B
    if (outcomes[0] === outcomes[3] && outcomes[1] === outcomes[2] && outcomes[0] !== outcomes[1]) {
        return { prediction: outcomes[0], weight: baseWeight * 1.2, source: `Pattern-Mirror->${outcomes[0]}` };
    }
    return null;
}

function analyzeRSI(history, rsiPeriod, baseWeight, volatility) {
    try {
        if (rsiPeriod <= 0) return null;
        const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
        if (actualNumbers.length < rsiPeriod + 1) return null;

        const rsiValue = calculateRSI(actualNumbers, rsiPeriod);
        if (rsiValue === null) return null;

        let overbought = 70; let oversold = 30;
        // Adjust overbought/oversold levels based on volatility
        if (volatility === "HIGH") { overbought = 80; oversold = 20; }
        else if (volatility === "MEDIUM") { overbought = 75; oversold = 25; }
        else if (volatility === "LOW") { overbought = 68; oversold = 32; }
        else if (volatility === "VERY_LOW") { overbought = 65; oversold = 35; }


        let prediction = null, signalStrengthFactor = 0;
        if (rsiValue < oversold) { // Oversold, predict rebound to BIG
            prediction = "BIG";
            signalStrengthFactor = (oversold - rsiValue) / oversold; // Stronger signal if deeper into oversold
        }
        else if (rsiValue > overbought) { // Overbought, predict reversal to SMALL
            prediction = "SMALL";
            signalStrengthFactor = (rsiValue - overbought) / (100 - overbought); // Stronger signal if deeper into overbought
        }

        if (prediction)
            return { prediction, weight: baseWeight * (0.60 + Math.min(signalStrengthFactor, 1.0) * 0.40), source: "RSI" };
        return null;
    } catch (error) {
        console.error("Error in analyzeRSI:", error);
        return null;
    }
}

function analyzeMACD(history, shortPeriod, longPeriod, signalPeriod, baseWeight) {
    try {
        if (shortPeriod <=0 || longPeriod <=0 || signalPeriod <=0 || shortPeriod >= longPeriod) return null;
        const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
        if (actualNumbers.length < longPeriod + signalPeriod -1) return null;

        const emaShort = calculateEMA(actualNumbers, shortPeriod);
        const emaLong = calculateEMA(actualNumbers, longPeriod);

        if (emaShort === null || emaLong === null) return null;
        const macdLineCurrent = emaShort - emaLong;

        // Calculate MACD line values for signal line calculation
        const macdLineValues = [];
        // Need to calculate MACD line for enough history to get a signal line
        const requiredHistoryForSignal = longPeriod + signalPeriod - 1;
        if (actualNumbers.length < requiredHistoryForSignal) return null;

        for (let i = actualNumbers.length - requiredHistoryForSignal; i < actualNumbers.length; i++) {
            const currentSlice = actualNumbers.slice(i); // Slice from current point to end of history
            const shortE = calculateEMA(currentSlice, shortPeriod);
            const longE = calculateEMA(currentSlice, longPeriod);
            if (shortE !== null && longE !== null) {
                macdLineValues.push(shortE - longE);
            }
        }
        // Ensure macdLineValues are in chronological order for EMA
        const macdLineValuesChronological = macdLineValues.slice().reverse();

        if (macdLineValuesChronological.length < signalPeriod) return null;

        const signalLine = calculateEMA(macdLineValuesChronological, signalPeriod);
        if (signalLine === null) return null;

        const macdHistogram = macdLineCurrent - signalLine;
        let prediction = null;

        // Check for MACD line crossing signal line
        if (macdLineValuesChronological.length >= signalPeriod + 1) {
            const prevMacdLineValues = macdLineValuesChronological.slice(1); // Exclude current for previous signal line
            const prevSignalLine = calculateEMA(prevMacdLineValues, signalPeriod);
            const prevMacdLine = macdLineValuesChronological[1]; // Previous MACD line value

            if (prevSignalLine !== null && prevMacdLine !== null) {
                if (prevMacdLine <= prevSignalLine && macdLineCurrent > signalLine) prediction = "BIG"; // Bullish crossover
                else if (prevMacdLine >= prevSignalLine && macdLineCurrent < signalLine) prediction = "SMALL"; // Bearish crossover
            }
        }

        // If no crossover, use histogram divergence
        if (!prediction) {
            if (macdHistogram > 0.25) prediction = "BIG";
            else if (macdHistogram < -0.25) prediction = "SMALL";
        }

        if (prediction) {
            const strengthFactor = Math.min(Math.abs(macdHistogram) / 0.6, 1.0); // Strength based on histogram magnitude
            return { prediction, weight: baseWeight * (0.55 + strengthFactor * 0.45), source: `MACD_${prediction === "BIG" ? "CrossB" : "CrossS"}` };
        }
        return null;
    } catch (error) {
        console.error("Error in analyzeMACD:", error);
        return null;
    }
}

function analyzeBollingerBands(history, period, stdDevMultiplier, baseWeight) {
    try {
        if (period <= 0) return null;
        const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
        if (actualNumbers.length < period) return null;

        const sma = calculateSMA(actualNumbers.slice(0, period), period);
        if (sma === null) return null;

        const stdDev = calculateStdDev(actualNumbers, period);
        if (stdDev === null || stdDev < 0.05) return null; // Avoid division by very small stdDev

        const upperBand = sma + (stdDev * stdDevMultiplier);
        const lowerBand = sma - (stdDev * stdDevMultiplier);
        const lastNumber = actualNumbers[0];
        let prediction = null;

        // Predict mean reversion: if price goes above upper band, predict SMALL; if below lower band, predict BIG
        if (lastNumber > upperBand * 1.01) prediction = "SMALL"; // Small buffer for clearer breach
        else if (lastNumber < lowerBand * 0.99) prediction = "BIG"; // Small buffer for clearer breach

        if (prediction) {
            const bandBreachStrength = Math.abs(lastNumber - sma) / (stdDev * stdDevMultiplier + 0.001); // How far outside the band
            return { prediction, weight: baseWeight * (0.65 + Math.min(bandBreachStrength, 0.9)*0.35), source: "Bollinger" };
        }
        return null;
    } catch (error) {
        console.error("Error in analyzeBollingerBands:", error);
        return null;
    }
}

function analyzeIchimokuCloud(history, tenkanPeriod, kijunPeriod, senkouBPeriod, baseWeight) {
    try {
        if (tenkanPeriod <=0 || kijunPeriod <=0 || senkouBPeriod <=0) return null;
        const chronologicalHistory = history.slice().reverse(); // Ensure chronological order for calculations
        const numbers = chronologicalHistory.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(n => !isNaN(n));

        // Need enough data for the longest period (Senkou Span B) plus Kijun periods for future cloud
        if (numbers.length < Math.max(senkouBPeriod, kijunPeriod) + kijunPeriod -1 ) return null;

        const getHighLow = (dataSlice) => {
            if (!dataSlice || dataSlice.length === 0) return { high: null, low: null };
            return { high: Math.max(...dataSlice), low: Math.min(...dataSlice) };
        };

        // Calculate Tenkan-Sen
        const tenkanSenValues = [];
        for (let i = 0; i < numbers.length; i++) {
            if (i < tenkanPeriod - 1) { tenkanSenValues.push(null); continue; }
            const { high, low } = getHighLow(numbers.slice(i - tenkanPeriod + 1, i + 1));
            if (high !== null && low !== null) tenkanSenValues.push((high + low) / 2); else tenkanSenValues.push(null);
        }

        // Calculate Kijun-Sen
        const kijunSenValues = [];
        for (let i = 0; i < numbers.length; i++) {
            if (i < kijunPeriod - 1) { kijunSenValues.push(null); continue; }
            const { high, low } = getHighLow(numbers.slice(i - kijunPeriod + 1, i + 1));
            if (high !== null && low !== null) kijunSenValues.push((high + low) / 2); else kijunSenValues.push(null);
        }

        const currentTenkan = tenkanSenValues[numbers.length - 1];
        const prevTenkan = tenkanSenValues[numbers.length - 2];
        const currentKijun = kijunSenValues[numbers.length - 1];
        const prevKijun = kijunSenValues[numbers.length - 2];

        // Calculate Senkou Span A (current Tenkan + Kijun) shifted forward Kijun periods
        const senkouSpanAValues = [];
        for(let i=0; i < numbers.length; i++) {
            if (tenkanSenValues[i] !== null && kijunSenValues[i] !== null) {
                senkouSpanAValues.push((tenkanSenValues[i] + kijunSenValues[i]) / 2);
            } else {
                senkouSpanAValues.push(null);
            }
        }

        // Calculate Senkou Span B (longest period high/low) shifted forward Kijun periods
        const senkouSpanBValues = [];
        for (let i = 0; i < numbers.length; i++) {
            if (i < senkouBPeriod -1) { senkouSpanBValues.push(null); continue; }
            const { high, low } = getHighLow(numbers.slice(i - senkouBPeriod + 1, i + 1));
            if (high !== null && low !== null) senkouSpanBValues.push((high + low) / 2); else senkouSpanBValues.push(null);
        }

        // Get current cloud values (shifted forward)
        const currentSenkouA = (numbers.length > kijunPeriod && senkouSpanAValues.length > numbers.length - 1 - kijunPeriod) ? senkouSpanAValues[numbers.length - 1 - kijunPeriod] : null;
        const currentSenkouB = (numbers.length > kijunPeriod && senkouSpanBValues.length > numbers.length - 1 - kijunPeriod) ? senkouSpanBValues[numbers.length - 1 - kijunPeriod] : null;

        // Chikou Span (current closing price shifted backward Kijun periods)
        const chikouSpan = numbers[numbers.length - 1];
        const priceKijunPeriodsAgo = numbers.length > kijunPeriod ? numbers[numbers.length - 1 - kijunPeriod] : null;

        const lastPrice = numbers[numbers.length - 1];
        if (lastPrice === null || currentTenkan === null || currentKijun === null || currentSenkouA === null || currentSenkouB === null || chikouSpan === null || priceKijunPeriodsAgo === null) {
            return null;
        }

        let prediction = null;
        let strengthFactor = 0.3; // Base strength

        // Tenkan-Sen / Kijun-Sen Cross
        let tkCrossSignal = null;
        if (prevTenkan !== null && prevKijun !== null) {
            if (prevTenkan <= prevKijun && currentTenkan > currentKijun) tkCrossSignal = "BIG"; // Bullish cross
            else if (prevTenkan >= prevKijun && currentTenkan < currentKijun) tkCrossSignal = "SMALL"; // Bearish cross
        }

        // Price vs Cloud
        const cloudTop = Math.max(currentSenkouA, currentSenkouB);
        const cloudBottom = Math.min(currentSenkouA, currentSenkouB);
        let priceVsCloudSignal = null;
        if (lastPrice > cloudTop) priceVsCloudSignal = "BIG"; // Price above cloud is bullish
        else if (lastPrice < cloudBottom) priceVsCloudSignal = "SMALL"; // Price below cloud is bearish

        // Chikou Span vs Price Kijun periods ago
        let chikouSignal = null;
        if (chikouSpan > priceKijunPeriodsAgo) chikouSignal = "BIG"; // Chikou above price is bullish
        else if (chikouSpan < priceKijunPeriodsAgo) chikouSignal = "SMALL"; // Chikou below price is bearish

        // Combine signals for stronger prediction
        if (tkCrossSignal && tkCrossSignal === priceVsCloudSignal && tkCrossSignal === chikouSignal) {
            prediction = tkCrossSignal; strengthFactor = 0.95; // All three agree - very strong
        }
        else if (priceVsCloudSignal && priceVsCloudSignal === tkCrossSignal && chikouSignal === priceVsCloudSignal) {
            prediction = priceVsCloudSignal; strengthFactor = 0.85; // Two main signals plus Chikou agree
        }
        else if (priceVsCloudSignal && priceVsCloudSignal === tkCrossSignal) {
            prediction = priceVsCloudSignal; strengthFactor = 0.7; // Two main signals agree
        }
        else if (priceVsCloudSignal && priceVsCloudSignal === chikouSignal) {
            prediction = priceVsCloudSignal; strengthFactor = 0.65; // Price vs Cloud and Chikou agree
        }
        else if (tkCrossSignal && priceVsCloudSignal) { // If TK cross and Price vs Cloud agree, but Chikou doesn't
            prediction = tkCrossSignal; strengthFactor = 0.55;
        }
        else if (priceVsCloudSignal) { // If only Price vs Cloud gives a clear signal
             prediction = priceVsCloudSignal; strengthFactor = 0.5;
        }

        // Additional strength for Kijun-Sen cross confirmation
        if (prediction === "BIG" && lastPrice > currentKijun && prevKijun !== null && numbers[numbers.length-2] <= prevKijun && priceVsCloudSignal === "BIG") {
            strengthFactor = Math.min(1.0, strengthFactor + 0.15);
        } else if (prediction === "SMALL" && lastPrice < currentKijun && prevKijun !== null && numbers[numbers.length-2] >= prevKijun && priceVsCloudSignal === "SMALL") {
            strengthFactor = Math.min(1.0, strengthFactor + 0.15);
        }

        if (prediction) return { prediction, weight: baseWeight * strengthFactor, source: "Ichimoku" };
        return null;
    } catch (error) {
        console.error("Error in analyzeIchimokuCloud:", error);
        return null;
    }
}

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
    return isNaN(entropy) ? 1 : entropy; // Return 1 if entropy calculation results in NaN (e.g., log2(0))
}

function analyzeVolatilityBreakout(history, trendContext, baseWeight) {
    // This signal looks for a continuation after a period of very low volatility (squeeze)
    if (trendContext.volatility === "VERY_LOW" && history.length >= 3) {
        const lastOutcome = getBigSmallFromNumber(history[0].actual);
        const prevOutcome = getBigSmallFromNumber(history[1].actual);
        if (lastOutcome && prevOutcome && lastOutcome === prevOutcome) return { prediction: lastOutcome, weight: baseWeight * 0.8, source: "VolSqueezeBreakoutCont" };
        if (lastOutcome && prevOutcome && lastOutcome !== prevOutcome) return { prediction: lastOutcome, weight: baseWeight * 0.6, source: "VolSqueezeBreakoutInitial" };
    }
    return null;
}

function analyzeStochastic(history, kPeriod, dPeriod, smoothK, baseWeight, volatility) {
    try {
        if (kPeriod <=0 || dPeriod <=0 || smoothK <=0) return null;
        const actualNumbers = history.map(entry => parseInt(entry.actualNumber || entry.actual)).filter(num => !isNaN(num));
        // Need enough data for K period + smoothing + D period
        if (actualNumbers.length < kPeriod + smoothK -1 + dPeriod -1) return null;

        const chronologicalNumbers = actualNumbers.slice().reverse();

        // Calculate %K
        let kValues = [];
        for (let i = kPeriod - 1; i < chronologicalNumbers.length; i++) {
            const currentSlice = chronologicalNumbers.slice(i - kPeriod + 1, i + 1);
            const currentClose = currentSlice[currentSlice.length - 1];
            const lowestLow = Math.min(...currentSlice);
            const highestHigh = Math.max(...currentSlice);
            if (highestHigh === lowestLow) kValues.push(kValues.length > 0 ? kValues[kValues.length-1] : 50); // Handle flat line
            else kValues.push(100 * (currentClose - lowestLow) / (highestHigh - lowestLow));
        }

        // Smooth %K to get Smoothed %K
        if (kValues.length < smoothK) return null;
        const smoothedKValues = [];
        for(let i = 0; i <= kValues.length - smoothK; i++) {
            smoothedKValues.push(calculateSMA(kValues.slice(i, i + smoothK).slice().reverse(), smoothK));
        }

        // Smooth Smoothed %K to get %D
        if (smoothedKValues.length < dPeriod) return null;
        const dValues = [];
        for(let i = 0; i <= smoothedKValues.length - dPeriod; i++) {
            dValues.push(calculateSMA(smoothedKValues.slice(i, i + dPeriod).slice().reverse(), dPeriod));
        }

        if (smoothedKValues.length < 2 || dValues.length < 2) return null;

        const currentK = smoothedKValues[smoothedKValues.length - 1];
        const prevK = smoothedKValues[smoothedKValues.length - 2];
        const currentD = dValues[dValues.length - 1];
        const prevD = dValues[dValues.length - 2];

        let overbought = 80; let oversold = 20;
        // Adjust overbought/oversold levels based on volatility
        if (volatility === "HIGH") { overbought = 88; oversold = 12; }
        else if (volatility === "MEDIUM") { overbought = 82; oversold = 18;}
        else if (volatility === "LOW") { overbought = 75; oversold = 25; }
        else if (volatility === "VERY_LOW") { overbought = 70; oversold = 30; }


        let prediction = null, strengthFactor = 0;
        // Bullish crossover (K crosses above D)
        if (prevK <= prevD && currentK > currentD && currentK < overbought - 5) { // Crossover below overbought region
             prediction = "BIG";
             strengthFactor = Math.max(0.35, (oversold + 5 - Math.min(currentK, currentD, oversold + 5)) / (oversold + 5));
        }
        // Bearish crossover (K crosses below D)
        else if (prevK >= prevD && currentK < currentD && currentK > oversold + 5) { // Crossover above oversold region
            prediction = "SMALL";
            strengthFactor = Math.max(0.35, (Math.max(currentK, currentD, overbought - 5) - (overbought - 5)) / (100 - (overbought - 5)));
        }
        // Overbought/Oversold exit
        if (!prediction) {
            if (prevK < oversold && currentK >= oversold && currentK < (oversold + (overbought-oversold)/2) ) { // Exiting oversold
                prediction = "BIG";
                strengthFactor = Math.max(0.25, (currentK - oversold) / ((overbought-oversold)/2) );
            } else if (prevK > overbought && currentK <= overbought && currentK > (oversold + (overbought-oversold)/2) ) { // Exiting overbought
                prediction = "SMALL";
                strengthFactor = Math.max(0.25, (overbought - currentK) / ((overbought-oversold)/2) );
            }
        }
        if (prediction) return { prediction, weight: baseWeight * (0.5 + Math.min(strengthFactor, 1.0) * 0.5), source: "Stochastic" };
        return null;
    } catch (error) {
        console.error("Error in analyzeStochastic:", error);
        return null;
    }
}

function analyzeVolatilityTrendFusion(trendContext, marketEntropyState, baseWeight) {
    const { direction, strength, volatility } = trendContext;
    const { state: entropy } = marketEntropyState;

    let prediction = null;
    let weightFactor = 0;

    // Strong trend with orderly, low/medium volatility: high confidence in trend continuation
    if (strength === 'STRONG' && (volatility === 'LOW' || volatility === 'MEDIUM') && entropy === 'ORDERLY') {
        prediction = direction.includes('BIG') ? 'BIG' : 'SMALL';
        weightFactor = 1.4;
    }
    // Strong trend with high volatility and chaos: potential for reversal or choppiness against trend
    else if (strength === 'STRONG' && volatility === 'HIGH' && entropy.includes('CHAOS')) {
        prediction = direction.includes('BIG') ? 'SMALL' : 'BIG'; // Predict reversal
        weightFactor = 1.2;
    }
    // Ranging market with low volatility and orderly: less directional, but predictable range
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
 * Calls the Gemini API to get a prediction based on features.
 * @param {Object} features - The feature set for the ML model.
 * @param {number} baseWeight - The base weight for this signal.
 * @param {string} modelType - "Standard" or "Volatile"
 * @returns {Promise<{prediction: string, weight: number, source: string}|null>}
 */
async function callGeminiForMLPrediction(features, baseWeight, modelType) {
    if (isMlModelLoading) {
        console.warn("ML Model is already loading, skipping new request.");
        return null;
    }
    isMlModelLoading = true;
    try {
        const prompt = `You are a prediction model for game outcomes.
        Based on the following features, predict whether the next outcome will be "BIG" or "SMALL".
        Also, provide a confidence score for your prediction as a number between 0.5 and 1.0.
        Format your response as "PREDICTION: [BIG/SMALL], CONFIDENCE: [0.5-1.0]".

        Features:
        ${JSON.stringify(features, null, 2)}

        Consider the model type: ${modelType}.
        If ${modelType} is "Standard", focus on trend and momentum indicators.
        If ${modelType} is "Volatile", focus on volatility and mean reversion.
        `;

        let chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = { contents: chatHistory };
        const apiKey = ""; // Canvas will provide this at runtime
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            console.log(`Gemini ML Response (${modelType}):`, text);

            const predictionMatch = text.match(/PREDICTION:\s*(BIG|SMALL)/i);
            const confidenceMatch = text.match(/CONFIDENCE:\s*([0-1]\.\d+)/i);

            let prediction = null;
            let confidence = 0.5;

            if (predictionMatch && predictionMatch[1]) {
                prediction = predictionMatch[1].toUpperCase();
            }
            if (confidenceMatch && confidenceMatch[1]) {
                confidence = parseFloat(confidenceMatch[1]);
                confidence = Math.max(0.5, Math.min(1.0, confidence)); // Clamp confidence
            }

            if (prediction) {
                return { prediction, weight: baseWeight * confidence * 1.5, source: `ML-${modelType}` };
            }
        } else {
            console.warn(`Gemini ML Response (${modelType}) structure unexpected:`, result);
        }
        return null;

    } catch (error) {
        console.error(`Error calling Gemini API for ML Model (${modelType}):`, error);
        return null;
    } finally {
        isMlModelLoading = false;
    }
}

async function analyzeMLModelSignal_Standard(features, baseWeight) {
    if (!features) return null;
    // Call Gemini API for prediction
    return await callGeminiForMLPrediction(features, baseWeight, "Standard");
}

async function analyzeMLModelSignal_Volatile(features, baseWeight) {
    if (!features) return null;
    // Call Gemini API for prediction
    return await callGeminiForMLPrediction(features, baseWeight, "Volatile");
}


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
        return { isStable: false, reason: "Unstable: Extreme Outcome OutcomeDominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }
    if (smallCount / recentResults.length >= 0.80) {
        outcomeDominance = "SMALL_DOMINANCE";
        return { isStable: false, reason: "Unstable: Extreme Outcome OutcomeDominance", details: `BIG:${bigCount}, SMALL:${smallCount} in last ${recentResults.length}`, dominance: outcomeDominance };
    }

    const entropy = calculateEntropyForSignal(recentResults, recentResults.length);
    if (entropy !== null && entropy < 0.45) { // Low entropy suggests highly predictable/stuck patterns
        return { isStable: false, reason: "Unstable: Very Low Entropy (Highly Predictable/Stuck)", details: `Entropy: ${entropy.toFixed(2)}`, dominance: outcomeDominance };
    }

    const actualNumbersRecent = confirmedHistory.slice(0, 15).map(p => parseInt(p.actualNumber || p.actual)).filter(n => !isNaN(n));
    if (actualNumbersRecent.length >= 10) {
        const stdDevNum = calculateStdDev(actualNumbersRecent, actualNumbersRecent.length);
        if (stdDevNum !== null && stdDevNum > 3.3) { // High numerical volatility
            return { isStable: false, reason: "Unstable: High Numerical Volatility", details: `StdDev: ${stdDevNum.toFixed(2)}`, dominance: outcomeDominance };
        }
    }
    let alternations = 0;
    for (let i = 0; i < recentResults.length - 1; i++) {
        if (recentResults[i] !== recentResults[i + 1]) alternations++;
    }
    if (alternations / recentResults.length > 0.75) { // High alternation indicates choppiness
        return { isStable: false, reason: "Unstable: Excessive Choppiness", details: `Alternations: ${alternations}/${recentResults.length}`, dominance: outcomeDominance };
    }

    return { isStable: true, reason: "Trend appears stable.", details: `Entropy: ${entropy !== null ? entropy.toFixed(2) : 'N/A'}`, dominance: outcomeDominance };
}

function analyzeMarketEntropyState(history, trendContext, stability) {
    const ENTROPY_WINDOW_SHORT = 10;
    const ENTROPY_WINDOW_LONG = 25;
    const VOL_CHANGE_THRESHOLD = 0.3; // 30% change in volatility

    if (history.length < ENTROPY_WINDOW_LONG) return { state: "UNCERTAIN_ENTROPY", details: "Insufficient history for entropy state." };

    const outcomesShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => getBigSmallFromNumber(e.actual));
    const outcomesLong = history.slice(0, ENTROPY_WINDOW_LONG).map(e => getBigSmallFromNumber(e.actual));

    const entropyShort = calculateEntropyForSignal(outcomesShort, ENTROPY_WINDOW_SHORT);
    const entropyLong = calculateEntropyForSignal(outcomesLong, ENTROPY_WINDOW_LONG);

    const numbersShort = history.slice(0, ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));
    // Use a slightly older window for previous volatility to compare
    const numbersLongPrev = history.slice(ENTROPY_WINDOW_SHORT, ENTROPY_WINDOW_SHORT + ENTROPY_WINDOW_SHORT).map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));

    let shortTermVolatility = null, prevShortTermVolatility = null;
    if(numbersShort.length >= ENTROPY_WINDOW_SHORT * 0.8) shortTermVolatility = calculateStdDev(numbersShort, numbersShort.length);
    if(numbersLongPrev.length >= ENTROPY_WINDOW_SHORT * 0.8) prevShortTermVolatility = calculateStdDev(numbersLongPrev, numbersLongPrev.length);


    let state = "STABLE_MODERATE"; // Default state
    let details = `E_S:${entropyShort?.toFixed(2)} E_L:${entropyLong?.toFixed(2)} Vol_S:${shortTermVolatility?.toFixed(2)} Vol_P:${prevShortTermVolatility?.toFixed(2)}`;

    if (entropyShort === null || entropyLong === null) return { state: "UNCERTAIN_ENTROPY", details };

    if (entropyShort < 0.5 && entropyLong < 0.6 && shortTermVolatility !== null && shortTermVolatility < 1.5) {
        state = "ORDERLY"; // Low entropy, low volatility - predictable
    }
    else if (entropyShort > 0.95 && entropyLong > 0.9) { // High entropy in both short and long term
        if (shortTermVolatility && prevShortTermVolatility && shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && shortTermVolatility > 2.5) {
            state = "RISING_CHAOS"; // Volatility increasing, high entropy
        } else {
            state = "STABLE_CHAOS"; // High entropy, but volatility not rapidly changing
        }
    }
    else if (shortTermVolatility && prevShortTermVolatility) {
        if (shortTermVolatility > prevShortTermVolatility * (1 + VOL_CHANGE_THRESHOLD) && entropyShort > 0.85 && shortTermVolatility > 2.0) {
            state = "RISING_CHAOS";
        } else if (shortTermVolatility < prevShortTermVolatility * (1 - VOL_CHANGE_THRESHOLD) && entropyLong > 0.85 && entropyShort < 0.80) {
            state = "SUBSIDING_CHAOS"; // Chaos decreasing
        }
    }

    // Override if trend stability analysis indicates instability
    if (!stability.isStable && (state === "ORDERLY" || state === "STABLE_MODERATE")) {
        state = "POTENTIAL_CHAOS_FROM_INSTABILITY";
        details += ` | StabilityOverride: ${stability.reason}`;
    }
    return { state, details };
}

function analyzeAdvancedMarketRegime(trendContext, marketEntropyState) {
    const { strength, volatility } = trendContext;
    const { state: entropy } = marketEntropyState;

    let probabilities = {
        bullTrend: 0.25, // Probability of being in a bullish trend
        bearTrend: 0.25, // Probability of being in a bearish trend
        volatileRange: 0.25, // Probability of being in a volatile ranging market
        quietRange: 0.25 // Probability of being in a quiet ranging market
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
const PERFORMANCE_WINDOW = 30; // Number of recent observations for accuracy calculation
const SESSION_PERFORMANCE_WINDOW = 15; // Shorter window for session-specific performance
const MIN_OBSERVATIONS_FOR_ADJUST = 10; // Minimum observations before adjusting a signal's weight
const MAX_WEIGHT_FACTOR = 2.5; // Max multiplier for a signal's weight (Increased from 1.95)
const MIN_WEIGHT_FACTOR = 0.01; // Min multiplier for a signal's weight (Decreased from 0.05)
const MAX_ALPHA_FACTOR = 1.6; // Max alpha for adaptive learning
const MIN_ALPHA_FACTOR = 0.4; // Min alpha for adaptive learning
const MIN_ABSOLUTE_WEIGHT = 0.0003; // Minimum weight a signal can have
const INACTIVITY_PERIOD_FOR_DECAY = PERFORMANCE_WINDOW * 3; // Periods of inactivity before weight decay
const DECAY_RATE = 0.025; // Rate at which weights decay during inactivity
const ALPHA_UPDATE_RATE = 0.06; // Rate at which alpha factor updates (Increased from 0.04)
const PROBATION_THRESHOLD_ACCURACY = 0.40; // Accuracy below which a signal goes on probation
const PROBATION_MIN_OBSERVATIONS = 15; // Minimum observations for probation consideration
const PROBATION_WEIGHT_CAP = 0.10; // Max weight for signals on probation

// Concept Drift Detector (EWMA-based)
let driftDetector = { p_min: Infinity, s_min: Infinity, n: 0, warning_level: 2.0, drift_level: 3.0 };

function getDynamicWeightAdjustment(signalSourceName, baseWeight, currentPeriodFull, currentVolatilityRegime, sessionHistory) {
    const perf = signalPerformance[signalSourceName];
    if (!perf) {
        // Initialize performance tracking for a new signal source
        signalPerformance[signalSourceName] = {
            correct: 0, total: 0, recentAccuracy: [],
            sessionCorrect: 0, sessionTotal: 0,
            lastUpdatePeriod: null, lastActivePeriod: null,
            currentAdjustmentFactor: 1.0, alphaFactor: 1.0, longTermImportanceScore: 0.5,
            performanceByVolatility: {}, isOnProbation: false
        };
        return Math.max(baseWeight, MIN_ABSOLUTE_WEIGHT);
    }

    // Reset session performance if it's a new session (or first call)
    if (sessionHistory.length <= 1) {
        perf.sessionCorrect = 0;
        perf.sessionTotal = 0;
    }

    // Apply decay if signal has been inactive for a while
    if (perf.lastUpdatePeriod !== currentPeriodFull) {
        if (perf.lastActivePeriod !== null && (currentPeriodFull - perf.lastActivePeriod) > INACTIVITY_PERIOD_FOR_DECAY) {
            if (perf.currentAdjustmentFactor > 1.0) perf.currentAdjustmentFactor = Math.max(1.0, perf.currentAdjustmentFactor - DECAY_RATE);
            else if (perf.currentAdjustmentFactor < 1.0) perf.currentAdjustmentFactor = Math.min(1.0, perf.currentAdjustmentFactor + DECAY_RATE);
            if (perf.isOnProbation) perf.isOnProbation = false; // Reset probation after decay
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

    // Session-specific adjustment (more reactive)
    let sessionAdjustmentFactor = 1.0;
    if (perf.sessionTotal >= 3) {
        const sessionAccuracy = perf.sessionCorrect / perf.sessionTotal;
        const sessionDeviation = sessionAccuracy - 0.5;
        sessionAdjustmentFactor = 1 + (sessionDeviation * 1.5);
        sessionAdjustmentFactor = Math.min(Math.max(sessionAdjustmentFactor, 0.6), 1.4);
    }

    // Combine all adjustment factors
    let finalAdjustmentFactor = perf.currentAdjustmentFactor * perf.alphaFactor * volatilitySpecificAdjustment * sessionAdjustmentFactor * (0.70 + perf.longTermImportanceScore * 0.6);

    // Apply probation cap if on probation
    if (perf.isOnProbation) {
        finalAdjustmentFactor = Math.min(finalAdjustmentFactor, PROBATION_WEIGHT_CAP);
    }

    let adjustedWeight = baseWeight * finalAdjustmentFactor;
    return Math.max(adjustedWeight, MIN_ABSOLUTE_WEIGHT); // Ensure weight doesn't drop too low
}

function updateSignalPerformance(contributingSignals, actualOutcome, periodFull, currentVolatilityRegime, lastFinalConfidence, concentrationModeActive, marketEntropyState) {
    if (!actualOutcome || !contributingSignals || contributingSignals.length === 0) return;
    const isHighConfidencePrediction = lastFinalConfidence > 0.75;
    // Check if the overall system prediction was correct, not just individual signals
    const isOverallCorrect = getBigSmallFromNumber(actualOutcome) === (lastFinalConfidence > 0.5 ? "BIG" : "SMALL");

    contributingSignals.forEach(signal => {
        if (!signal || !signal.source) return;
        const source = signal.source;
        if (!signalPerformance[source]) {
            // Initialize if not present (should be handled by getDynamicWeightAdjustment, but for safety)
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

        // Only update counts once per period for each signal
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

            // Update long-term importance score based on accuracy and confidence
            let importanceDelta = 0;
            if(outcomeCorrect) {
                importanceDelta = isHighConfidencePrediction ? 0.025 : 0.01;
            } else {
                importanceDelta = isHighConfidencePrediction && !isOverallCorrect ? -0.040 : -0.015; // Penalize high-confidence wrong predictions more
            }

            // Amplify importance changes during volatile periods or concentration mode
            if (concentrationModeActive || marketEntropyState.includes("CHAOS")) {
                 importanceDelta *= 1.5;
            }
            signalPerformance[source].longTermImportanceScore = Math.min(1.0, Math.max(0.0, signalPerformance[source].longTermImportanceScore + importanceDelta));

            // Keep track of recent accuracy for sliding window calculation
            signalPerformance[source].recentAccuracy.push(outcomeCorrect);
            if (signalPerformance[source].recentAccuracy.length > PERFORMANCE_WINDOW) {
                signalPerformance[source].recentAccuracy.shift();
            }

            // Adjust weight and alpha factor based on recent performance
            if (signalPerformance[source].total >= MIN_OBSERVATIONS_FOR_ADJUST && signalPerformance[source].recentAccuracy.length >= PERFORMANCE_WINDOW / 2) {
                const recentCorrectCount = signalPerformance[source].recentAccuracy.reduce((sum, acc) => sum + acc, 0);
                const accuracy = recentCorrectCount / signalPerformance[source].recentAccuracy.length;
                const deviation = accuracy - 0.5; // Deviation from random (0.5)
                let newAdjustmentFactor = 1 + (deviation * 3.5); // Aggressive adjustment
                newAdjustmentFactor = Math.min(Math.max(newAdjustmentFactor, MIN_WEIGHT_FACTOR), MAX_WEIGHT_FACTOR);
                signalPerformance[source].currentAdjustmentFactor = newAdjustmentFactor;

                // Probation logic: if accuracy drops too low
                if (signalPerformance[source].recentAccuracy.length >= PROBATION_MIN_OBSERVATIONS && accuracy < PROBATION_THRESHOLD_ACCURACY) {
                    signalPerformance[source].isOnProbation = true;
                } else if (accuracy > PROBATION_THRESHOLD_ACCURACY + 0.15) { // Exit probation if accuracy improves significantly
                    signalPerformance[source].isOnProbation = false;
                }

                // Adaptive learning rate for alpha factor
                let alphaLearningRate = ALPHA_UPDATE_RATE;
                if (accuracy < 0.35) alphaLearningRate *= 1.75; // Learn faster if very inaccurate
                else if (accuracy < 0.45) alphaLearningRate *= 1.4;

                // Alpha factor adjusts more slowly, representing long-term trust
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

function detectConceptDrift(isCorrect) {
    // DDM (Drift Detection Method) for concept drift
    // p_i: observed error rate
    // s_i: standard deviation of error rate
    // p_min: minimum observed error rate
    // s_min: standard deviation at p_min
    driftDetector.n++;
    const errorRate = isCorrect ? 0 : 1;
    
    // Calculate current error rate (p_i) and its standard deviation (s_i)
    // Using a simplified incremental calculation for p_i
    const p_i = (driftDetector.n > 1 ? driftDetector.p_i : 0) + (errorRate - (driftDetector.n > 1 ? driftDetector.p_i : 0)) / driftDetector.n;
    driftDetector.p_i = p_i;
    const s_i = Math.sqrt(p_i * (1 - p_i) / driftDetector.n);

    // Update minimum error rate and its standard deviation
    if (p_i + s_i < driftDetector.p_min + driftDetector.s_min) {
        driftDetector.p_min = p_i;
        driftDetector.s_min = s_i;
    }

    // Check for drift and warning conditions
    if (p_i + s_i > driftDetector.p_min + driftDetector.drift_level * driftDetector.s_min) {
        // Drift detected, reset detector
        driftDetector.p_min = Infinity;
        driftDetector.s_min = Infinity;
        driftDetector.n = 1; // Start new window
        return 'DRIFT';
    } else if (p_i + s_i > driftDetector.p_min + driftDetector.warning_level * driftDetector.s_min) {
        return 'WARNING';
    } else {
        return 'STABLE';
    }
}


// Regime profiles define which signals are preferred in different market conditions
let REGIME_SIGNAL_PROFILES = {
    "TREND_STRONG_LOW_VOL": { baseWeightMultiplier: 1.30, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'volBreak', 'fusion', 'ml_standard'], contextualAggression: 1.35, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "TREND_STRONG_MED_VOL": { baseWeightMultiplier: 1.20, activeSignalTypes: ['trend', 'momentum', 'ichimoku', 'pattern', 'fusion', 'ml_standard'], contextualAggression: 1.25, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "TREND_STRONG_HIGH_VOL": { baseWeightMultiplier: 0.70, activeSignalTypes: ['trend', 'ichimoku', 'entropy', 'volPersist', 'fusion', 'ml_volatile'], contextualAggression: 0.70, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_LOW_VOL": { baseWeightMultiplier: 1.30, activeSignalTypes: ['meanRev', 'pattern', 'volBreak', 'stochastic', 'bollinger'], contextualAggression: 1.30, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_MED_VOL": { baseWeightMultiplier: 1.15, activeSignalTypes: ['meanRev', 'pattern', 'stochastic', 'rsi', 'bollinger'], contextualAggression: 1.15, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "RANGE_HIGH_VOL": { baseWeightMultiplier: 0.85, activeSignalTypes: ['meanRev', 'entropy', 'bollinger', 'volPersist', 'fusion', 'ml_volatile'], contextualAggression: 0.85, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 },
    "DEFAULT": { baseWeightMultiplier: 0.9, activeSignalTypes: ['all'], contextualAggression: 0.9, recentAccuracy: [], totalPredictions: 0, correctPredictions: 0 }
};
const REGIME_ACCURACY_WINDOW = 35; // Window for regime accuracy calculation
const REGIME_LEARNING_RATE_BASE = 0.028; // Base learning rate for regime adaptation
let GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = 0.5; // Influences dynamic learning rate for regimes

function discoverAndAdaptRegimes(history, trendContext, stability, sharedStats) {
    const CHOPPY_PERSISTENCE_THRESHOLD = 8; // How many consecutive choppy periods to trigger Aurochs mode
    const aurochsState = sharedStats.aurochsState || { choppyCount: 0 };

    // Detect persistent choppiness
    if (trendContext.volatility === "VERY_LOW" && stability.reason.includes("Choppiness")) {
        aurochsState.choppyCount++;
    } else {
        aurochsState.choppyCount = 0; // Reset if choppiness breaks
    }

    // Dynamically create a new regime profile if a persistent pattern is identified
    if (aurochsState.choppyCount >= CHOPPY_PERSISTENCE_THRESHOLD && !REGIME_SIGNAL_PROFILES["CUSTOM_AUROCHS_MODE"]) {
        console.log("!!! DYNAMIC REGIME DISCOVERY: New 'AUROCHS' mode identified. Creating profile. !!!");
        REGIME_SIGNAL_PROFILES["CUSTOM_AUROCHS_MODE"] = {
            baseWeightMultiplier: 1.40, // Higher weight for this specific choppy condition
            activeSignalTypes: ['pattern', 'meanRev', 'stochastic', 'bollinger'], // Signals best suited for choppy, ranging markets
            contextualAggression: 1.50, // More aggressive in this mode
            recentAccuracy: [],
            totalPredictions: 0,
            correctPredictions: 0
        };
    }

    return aurochsState; // Return updated state for persistence
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
            // Dynamic learning rate based on overall system accuracy
            let dynamicLearningRateFactor = 1.0 + Math.abs(0.5 - GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE) * 0.7;
            dynamicLearningRateFactor = Math.max(0.65, Math.min(1.5, dynamicLearningRateFactor));
            let currentLearningRate = REGIME_LEARNING_RATE_BASE * dynamicLearningRateFactor;
            currentLearningRate = Math.max(0.01, Math.min(0.07, currentLearningRate)); // Clamp learning rate

            if (regimeAcc > 0.62) { // Reward good performance
                profile.baseWeightMultiplier = Math.min(1.9, profile.baseWeightMultiplier + currentLearningRate);
                profile.contextualAggression = Math.min(1.8, profile.contextualAggression + currentLearningRate * 0.5);
            } else if (regimeAcc < 0.38) { // Penalize poor performance
                profile.baseWeightMultiplier = Math.max(0.20, profile.baseWeightMultiplier - currentLearningRate * 1.3);
                profile.contextualAggression = Math.max(0.30, profile.contextualAggression - currentLearningRate * 0.7);
            }
        }
    }
}

// Global helper function to categorize signals
function getSignalCategory(source) {
    if (source.includes("MACD") || source.includes("Ichimoku") || source.includes("Fusion")) return 'trend';
    if (source.includes("Stochastic") || source.includes("RSI")) return 'momentum';
    if (source.includes("Bollinger") || source.includes("Streak") || source.includes("VolSqueezeBreakout")) return 'meanRev';
    if (source.includes("Alt") || source.includes("Pattern") || source.includes("Transition") || source.includes("WeightedHist")) return 'pattern';
    if (source.includes("ML-")) return 'ml';
    if (source.includes("Vol-Trend-Fusion")) return 'fusion'; // Specific for fusion, if needed separately from 'trend'
    return 'other'; // Default category for unclassified signals
}

function analyzePredictionConsensus(signals, trendContext) {
    if (!signals || signals.length < 4) {
        return { score: 0.5, factor: 1.0, details: "Insufficient signals for consensus" };
    }

    // Categorize signals to understand diversity of agreement
    const categories = {
        trend: { BIG: 0, SMALL: 0, weight: 0 },
        momentum: { BIG: 0, SMALL: 0, weight: 0 },
        meanRev: { BIG: 0, SMALL: 0, weight: 0 },
        pattern: { BIG: 0, SMALL: 0, weight: 0 },
        ml: { BIG: 0, SMALL: 0, weight: 0 },
        fusion: { BIG: 0, SMALL: 0, weight: 0 }, // Added fusion as a category
        other: { BIG: 0, SMALL: 0, weight: 0 }
    };

    signals.forEach(s => {
        const category = getSignalCategory(s.source);
        if (category && (s.prediction === "BIG" || s.prediction === "SMALL")) {
            categories[category][s.prediction] += s.adjustedWeight;
        }
    });

    let bigWeight = 0, smallWeight = 0;
    let bigCats = 0, smallCats = 0, mixedCats = 0;

    for(const cat of Object.values(categories)) {
        const totalWeight = cat.BIG + cat.SMALL;
        if (totalWeight > 0.001) { // Only consider categories with meaningful weight
            bigWeight += cat.BIG;
            smallWeight += cat.SMALL;
            if(cat.BIG > cat.SMALL * 1.5) bigCats++; // A category strongly favors BIG
            else if (cat.SMALL > cat.BIG * 1.5) smallCats++; // A category strongly favors SMALL
            else mixedCats++; // Category is mixed or neutral
        }
    }

    let consensusScore = 0.5;
    const totalCats = bigCats + smallCats + mixedCats;
    if(totalCats > 0) {
        const dominantCats = Math.max(bigCats, smallCats);
        const nonDominantCats = Math.min(bigCats, smallCats);
        consensusScore = (dominantCats - nonDominantCats) / totalCats; // Score based on categorical agreement
    }

    let factor = 1.0 + (consensusScore * 0.5); // Boost confidence if high consensus

    // Penalize if trend and momentum signals contradict in a strong trend
    if (trendContext.strength === 'STRONG') {
        if((categories.trend.BIG > categories.trend.SMALL && categories.momentum.SMALL > categories.momentum.BIG) ||
           (categories.trend.SMALL > categories.trend.BIG && categories.momentum.BIG > categories.momentum.SMALL)) {
            factor *= 0.6; // Reduce factor due to internal contradiction
        }
    }

    return {
        score: consensusScore,
        factor: Math.max(0.4, Math.min(1.6, factor)), // Clamp factor
        details: `Bcat:${bigCats},Scat:${smallCats},Mcat:${mixedCats},Score:${consensusScore.toFixed(2)}`
    };
}

function analyzeConfidenceModel(preliminaryDecision, signals, consensus, driftState, pqs) {
    let confidenceLevel = 1; // Level 1: Low, 2: Medium, 3: High
    let confidenceReason = "Baseline";

    const agreeingSignals = signals.filter(s => s.prediction === preliminaryDecision);
    const disagreeingSignals = signals.filter(s => s.prediction && s.prediction !== preliminaryDecision);

    const agreeingWeight = agreeingSignals.reduce((sum, s) => sum + s.adjustedWeight, 0);
    const disagreeingWeight = disagreeingSignals.reduce((sum, s) => sum + s.adjustedWeight, 0);

    const weightRatio = agreeingWeight / (disagreeingWeight + 0.01); // Ratio of supporting vs opposing weight

    if (consensus.score > 0.6 && weightRatio > 2.5 && pqs > 0.6) {
        confidenceLevel = 2;
        confidenceReason = "Good Consensus & Weight Ratio";
    }

    if (consensus.score > 0.8 && weightRatio > 4.0 && pqs > 0.75 && driftState === 'STABLE') {
        const mlSignal = signals.find(s => s.source.startsWith("ML-"));
        if (mlSignal && mlSignal.prediction === preliminaryDecision) {
            confidenceLevel = 3;
            confidenceReason = "High-Conviction Consensus with ML Agreement";
        }
    }

    // Override to low confidence if critical issues are present
    if (driftState === 'DRIFT' || pqs < 0.25) {
        confidenceLevel = 1;
        confidenceReason = "Override: High Uncertainty/Drift";
    }

    return { finalConfidenceLevel: confidenceLevel, reason: confidenceReason };
}


function analyzePathConfluenceStrength(signals, finalPrediction) {
    if (!signals || signals.length === 0 || !finalPrediction) return { score: 0, diversePaths: 0, details: "No valid signals or prediction." };

    // Filter for signals that agree with the final prediction and have meaningful weight
    const agreeingSignals = signals.filter(s => s.prediction === finalPrediction && s.adjustedWeight > MIN_ABSOLUTE_WEIGHT * 10);
    if (agreeingSignals.length < 2) {
        return { score: 0, diversePaths: agreeingSignals.length, details: "Insufficient agreeing signals." };
    }

    // Categorize signals to see how many different types of analysis agree
    const signalCategories = new Set();
    agreeingSignals.forEach(s => {
        if (s.source.includes("MACD") || s.source.includes("Ichimoku")) signalCategories.add('trend');
        else if (s.source.includes("Stochastic") || s.source.includes("RSI")) signalCategories.add('momentum');
        else if (s.source.includes("Bollinger") || s.source.includes("ZScore")) signalCategories.add('meanRev');
        else if (s.source.includes("Gram") || s.source.includes("Cycle") || s.source.includes("Pattern") || s.source.includes("Transition") || s.source.includes("Streak")) signalCategories.add('pattern');
        else if (s.source.includes("Vol") || s.source.includes("FractalDim")) signalCategories.add('volatility');
        else if (s.source.includes("Bayesian") || s.source.includes("Superposition") || s.source.includes("ML-")) signalCategories.add('probabilistic');
        else signalCategories.add('other');
    });

    const diversePathCount = signalCategories.size;
    let confluenceScore = 0;

    // Score based on diversity of agreeing signals
    if (diversePathCount >= 4) confluenceScore = 0.20;
    else if (diversePathCount === 3) confluenceScore = 0.12;
    else if (diversePathCount === 2) confluenceScore = 0.05;

    // Add score based on number of very strong agreeing signals
    const veryStrongAgreeingCount = agreeingSignals.filter(s => s.adjustedWeight > 0.10).length;
    confluenceScore += Math.min(veryStrongAgreeingCount * 0.02, 0.10); // Max 0.10 from strong signals

    return { score: Math.min(confluenceScore, 0.30), diversePaths: diversePathCount, details: `Paths:${diversePathCount},Strong:${veryStrongAgreeingCount}` };
}

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

    // Consistency is the ratio of dominant prediction count to total predictions
    const consistencyScore = Math.max(predictions.BIG, predictions.SMALL) / totalPredictions;
    return { score: consistencyScore, details: `Overall split B:${predictions.BIG}/S:${predictions.SMALL}` };
}

let consecutiveHighConfLosses = 0;
let reflexiveCorrectionActive = 0; // Countdown for reflexive correction mode

function checkForAnomalousPerformance(currentSharedStats) {
    // If reflexive correction is active, decrement counter and return true
    if (reflexiveCorrectionActive > 0) {
        reflexiveCorrectionActive--;
        return true;
    }

    // Check last prediction's outcome if available
    if (currentSharedStats && typeof currentSharedStats.lastFinalConfidence === 'number' && currentSharedStats.lastActualOutcome) {
        const lastPredOutcomeBS = getBigSmallFromNumber(currentSharedStats.lastActualOutcome);
        const lastPredWasCorrect = lastPredOutcomeBS === currentSharedStats.lastPredictedOutcome;

        const lastPredWasHighConf = currentSharedStats.lastConfidenceLevel === 3;

        // Count consecutive high-confidence losses
        if (lastPredWasHighConf && !lastPredWasCorrect) {
            consecutiveHighConfLosses++;
        } else {
            consecutiveHighConfLosses = 0; // Reset if not a high-conf loss
        }
    }

    // Trigger reflexive correction if 2 or more consecutive high-confidence losses
    if (consecutiveHighConfLosses >= 2) {
        reflexiveCorrectionActive = 5; // Activate for 5 periods
        consecutiveHighConfLosses = 0; // Reset counter
        return true;
    }

    return false;
}

function calculateUncertaintyScore(trendContext, stability, marketEntropyState, signalConsistency, pathConfluence, globalAccuracy, isReflexiveCorrection, driftState, pqs) {
    let uncertaintyScore = 0;
    let reasons = [];

    // Add points for various uncertainty factors
    if (isReflexiveCorrection) {
        uncertaintyScore += 80; // High penalty for active reflexive correction
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
        uncertaintyScore += (3 - pathConfluence.diversePaths) * 15; // Penalty for fewer diverse signals agreeing
        reasons.push(`LowConfluence:${pathConfluence.diversePaths}`);
    }
    if (trendContext.isTransitioning) {
        uncertaintyScore += 25; // Penalty for market regime transitions
        reasons.push("RegimeTransition");
    }
    if (trendContext.volatility === "HIGH") {
        uncertaintyScore += 20; // Penalty for high volatility
        reasons.push("HighVolatility");
    }
     if (typeof globalAccuracy === 'number' && globalAccuracy < 0.48) {
        uncertaintyScore += (0.48 - globalAccuracy) * 150; // Penalty for low overall accuracy
        reasons.push(`LowGlobalAcc:${globalAccuracy.toFixed(2)}`);
    }
    // New: Reduce uncertainty if PQS is high, indicating good internal quality
    uncertaintyScore = Math.max(0, uncertaintyScore - (pqs - 0.5) * 100); // Subtract up to 50 points if PQS is 1.0

    return { score: uncertaintyScore, reasons: reasons.join(';') };
}

function createFeatureSetForML(history, trendContext, time) {
    const numbers = history.map(e => parseInt(e.actualNumber || e.actual)).filter(n => !isNaN(n));
    // Ensure sufficient data for all features
    if(numbers.length < 52) return null; 

    // Return a structured feature set for the ML model
    return {
        time_sin: time.sin,
        time_cos: time.cos,
        last_5_mean: calculateSMA(numbers, 5),
        last_20_mean: calculateSMA(numbers, 20),
        stddev_10: calculateStdDev(numbers, 10),
        stddev_30: calculateStdDev(numbers, 30),
        rsi_14: calculateRSI(numbers, 14),
        // Ensure these indicators return a value before accessing properties
        stoch_k_14: analyzeStochastic(history, 14, 3, 3, 1.0, trendContext.volatility)?.currentK || 50, // Default to 50 if null
        macd_hist: analyzeMACD(history, 12, 26, 9, 1.0)?.macdHistogram || 0, // Default to 0 if null
        trend_strength: trendContext.strength === 'STRONG' ? 2 : (trendContext.strength === 'MODERATE' ? 1 : 0),
        volatility_level: trendContext.volatility === 'HIGH' ? 2 : (trendContext.volatility === 'MEDIUM' ? 1 : 0),
    };
}


// --- Main Prediction Function ---
async function ultraAIPredict(currentSharedHistory, sharedStatsPayload = {}) {
    let currentSharedStats = sharedStatsPayload;

    const currentPeriodFull = Date.now(); // Unique identifier for the current prediction period
    const time = getCurrentISTHour();

    const realTimeData = getRealTimeExternalData(); // Fetch external data (simulated)

    console.log(`Quantum AI Supercore v46.0.3 Initializing Prediction for period ${currentPeriodFull}`);
    let masterLogic = [`QAScore_v46.0.3(IST_Hr:${time.raw})`];
    if(realTimeData && realTimeData.reason) {
        masterLogic.push(realTimeData.reason);
    }

    // Analyze market context and trend
    const trendContext = getMarketRegimeAndTrendContext(currentSharedHistory);
    const stability = analyzeTrendStability(currentSharedHistory);
    const updatedAurochsState = discoverAndAdaptRegimes(currentSharedHistory, trendContext, stability, currentSharedStats);

    // Apply custom regime if detected (e.g., "AUROCHS_MODE")
    let finalTrendContext = getMarketRegimeAndTrendContext(currentSharedHistory);
    if (updatedAurochsState.choppyCount >= 8) {
       finalTrendContext.macroRegime = "CUSTOM_AUROCHS_MODE";
    }

    const primeTimeSession = getPrimeTimeSession(time.raw);
    if (primeTimeSession) {
        masterLogic.push(`!!! PRIME TIME ACTIVE: ${primeTimeSession.session} !!!`);
    }

    // Update global accuracy for regime learning (if available from shared stats)
    let longTermGlobalAccuracy = currentSharedStats?.longTermGlobalAccuracy || GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE;
    if (currentSharedStats && typeof currentSharedStats.longTermGlobalAccuracy === 'number') {
        GLOBAL_LONG_TERM_ACCURACY_FOR_LEARNING_RATE = currentSharedStats.longTermGlobalAccuracy;
    }

    // Check for anomalous performance and activate reflexive correction
    const isReflexiveCorrection = checkForAnomalousPerformance(currentSharedStats);
    if (isReflexiveCorrection) {
        masterLogic.push(`!!! REFLEXIVE CORRECTION ACTIVE !!! (Countdown: ${reflexiveCorrectionActive})`);
    }

    masterLogic.push(`TrendCtx(Dir:${finalTrendContext.direction},Str:${finalTrendContext.strength},Vol:${finalTrendContext.volatility},Regime:${finalTrendContext.macroRegime})`);

    // Analyze market entropy
    const marketEntropyAnalysis = analyzeMarketEntropyState(currentSharedHistory, finalTrendContext, stability);
    masterLogic.push(`MarketEntropy:${marketEntropyAnalysis.state}`);

    // Analyze advanced market regime probabilities
    const advancedRegime = analyzeAdvancedMarketRegime(finalTrendContext, marketEntropyAnalysis);
    masterLogic.push(`AdvRegime:${advancedRegime.details}`);

    // Determine if concentration mode should be engaged (due to instability, chaos, or reflexive correction)
    let concentrationModeEngaged = !stability.isStable || isReflexiveCorrection || marketEntropyAnalysis.state.includes("CHAOS");

    // Detect concept drift
    let driftState = 'STABLE';
    if (currentSharedStats && typeof currentSharedStats.lastActualOutcome !== 'undefined' && currentSharedStats.lastPredictedOutcome !== undefined) {
        const lastPredictionWasCorrect = getBigSmallFromNumber(currentSharedStats.lastActualOutcome) === currentSharedStats.lastPredictedOutcome;
        driftState = detectConceptDrift(lastPredictionWasCorrect);
        if (driftState !== 'STABLE') {
            masterLogic.push(`!!! DRIFT DETECTED: ${driftState} !!!`);
            concentrationModeEngaged = true; // Engage concentration mode on drift
        }
    }

    if (concentrationModeEngaged) masterLogic.push(`ConcentrationModeActive`);

    const currentVolatilityRegimeForPerf = finalTrendContext.volatility;
    const currentMacroRegime = finalTrendContext.macroRegime;

    // Update signal and regime performance based on previous period's outcome
    if (currentSharedStats && currentSharedStats.lastPredictionSignals && currentSharedStats.lastActualOutcome) {
        updateSignalPerformance(
            currentSharedStats.lastPredictionSignals,
            getBigSmallFromNumber(currentSharedStats.lastActualOutcome),
            currentSharedStats.lastPeriodFull,
            currentSharedStats.lastVolatilityRegime || currentVolatilityRegimeForPerf, // Use last regime if available
            currentSharedStats.lastFinalConfidence,
            currentSharedStats.lastConcentrationModeEngaged || false,
            currentSharedStats.lastMarketEntropyState || "STABLE_MODERATE"
        );

        // ML model accuracy check (for potential future retraining triggers, currently just for logging)
        const mlSignalsInLastCycle = currentSharedStats.lastPredictionSignals.filter(s => s.source.startsWith('ML-'));
        if (mlSignalsInLastCycle.length > 0) {
            const correctMLPredictions = mlSignalsInLastCycle.filter(s => s.prediction === getBigSmallFromNumber(currentSharedStats.lastActualOutcome)).length;
            // This accuracy can be used to inform future ML model behavior or actual retraining
            // mlModelTrainingState.lastAccuracy = correctMLPredictions / mlSignalsInLastCycle.length;
            // if (mlModelTrainingState.lastAccuracy < mlModelTrainingState.minAccuracyForNoRetrain) {
            //     triggerMLModelRetraining("LOW_ML_ACCURACY");
            // }
        }

        if (currentSharedStats.lastPredictedOutcome) {
            updateRegimeProfilePerformance(currentSharedStats.lastMacroRegime, getBigSmallFromNumber(currentSharedStats.lastActualOutcome), currentSharedStats.lastPredictedOutcome);
        }
    }

    // Filter history to only confirmed results for analysis
    const confirmedHistory = currentSharedHistory.filter(p => p && p.actual !== null && p.actualNumber !== undefined);
    if (confirmedHistory.length < 52) { // Minimum history required for robust analysis
        masterLogic.push(`InsufficientHistory_ForceRandom`);
        const finalDecision = Math.random() > 0.5 ? "BIG" : "SMALL";
        const predictionOutput = {
            predictions: { BIG: { confidence: 0.5, logic: "ForcedRandom" }, SMALL: { confidence: 0.5, logic: "ForcedRandom" } },
            finalDecision: finalDecision, finalConfidence: 0.5, confidenceLevel: 1, isForcedPrediction: true,
            overallLogic: masterLogic.join(' -> '), source: "InsufficientHistory",
        };
        // Update shared stats for the next cycle
        const newState = {
            ...currentSharedStats,
            lastPredictedOutcome: finalDecision, lastFinalConfidence: 0.5, lastConfidenceLevel: 1, lastMacroRegime: currentMacroRegime,
            lastPredictionSignals: [], lastConcentrationModeEngaged: concentrationModeEngaged,
            lastMarketEntropyState: marketEntropyAnalysis.state, lastVolatilityRegime: finalTrendContext.volatility, periodFull: currentPeriodFull,
            aurochsState: updatedAurochsState
        };
        return predictionOutput;
    }

    let signals = [];
    // Get the current regime's specific profile or default
    const currentRegimeProfile = REGIME_SIGNAL_PROFILES[currentMacroRegime] || REGIME_SIGNAL_PROFILES["DEFAULT"];
    let regimeContextualAggression = (currentRegimeProfile.contextualAggression || 1.0) * (primeTimeSession?.aggression || 1.0);

    // Reduce aggression during reflexive correction or drift
    if (isReflexiveCorrection || driftState === 'DRIFT') regimeContextualAggression *= 0.25;
    else if (concentrationModeEngaged) regimeContextualAggression *= 0.6;

    // Define all signal generators
    const signalGenerators = [
        () => analyzeTransitions(confirmedHistory, 0.05),
        () => analyzeStreaks(confirmedHistory, 0.045),
        () => analyzeAlternatingPatterns(confirmedHistory, 0.06),
        () => analyzeRSI(confirmedHistory, 14, 0.08, finalTrendContext.volatility),
        () => analyzeMACD(confirmedHistory, 12, 26, 9, 0.09),
        () => analyzeBollingerBands(confirmedHistory, 20, 2.1, 0.07),
        () => analyzeIchimokuCloud(confirmedHistory, 9, 26, 52, 0.14),
        () => analyzeStochastic(confirmedHistory, 14, 3, 3, 0.08, finalTrendContext.volatility),
        () => analyzeVolatilityBreakout(confirmedHistory, trendContext, 0.07),
        () => analyzeVolatilityTrendFusion(finalTrendContext, marketEntropyAnalysis, 0.25)
    ];

    // Create feature set for ML models
    const mlFeatures = createFeatureSetForML(confirmedHistory, trendContext, time);
    if(mlFeatures) {
         if (currentRegimeProfile.activeSignalTypes.includes('ml_standard')) {
            // Await the asynchronous ML signal
            const mlStandardSignal = await analyzeMLModelSignal_Standard(mlFeatures, 0.40);
            if (mlStandardSignal) signalGenerators.push(() => mlStandardSignal); // Add as a function that returns the result
         }
         if (currentRegimeProfile.activeSignalTypes.includes('ml_volatile')) {
            // Await the asynchronous ML signal
            const mlVolatileSignal = await analyzeMLModelSignal_Volatile(mlFeatures, 0.45);
            if (mlVolatileSignal) signalGenerators.push(() => mlVolatileSignal); // Add as a function that returns the result
         }
    }

    // Collect all signals, applying dynamic weight adjustments
    for (const gen of signalGenerators) {
        const result = await Promise.resolve(gen()); // Ensure all generators are awaited, even if synchronous
        if (result && result.weight && result.prediction) {
            result.adjustedWeight = getDynamicWeightAdjustment(result.source, result.weight * regimeContextualAggression, currentPeriodFull, currentVolatilityRegimeForPerf, currentSharedHistory);
            signals.push(result);
        }
    }

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
        return predictionOutput;
    }

    // --- NEW: Contextual Signal Boosting/Suppression ---
    let contextualSignalAdjustments = {};
    const currentEntropyState = marketEntropyAnalysis.state;
    const currentTrendStrength = finalTrendContext.strength;
    const currentVolatility = finalTrendContext.volatility;

    // Define adjustment multipliers based on market state
    if (currentEntropyState === "ORDERLY") {
        contextualSignalAdjustments.trend = 1.15; // Boost trend signals in orderly markets
        contextualSignalAdjustments.momentum = 1.10;
        contextualSignalAdjustments.meanRev = 0.85; // Suppress mean reversion in orderly trends
        contextualSignalAdjustments.ml = 1.10; // Boost ML in stable conditions
    } else if (currentEntropyState.includes("CHAOS")) {
        contextualSignalAdjustments.trend = 0.80; // Suppress trend in chaotic markets
        contextualSignalAdjustments.momentum = 0.90;
        contextualSignalAdjustments.meanRev = 1.20; // Boost mean reversion in chaos
        contextualSignalAdjustments.volatility = 1.15; // Boost volatility-based signals
        contextualSignalAdjustments.ml = 1.25; // ML might be good at finding patterns in chaos
    }

    if (currentTrendStrength === "STRONG") {
        contextualSignalAdjustments.trend = (contextualSignalAdjustments.trend || 1.0) * 1.10;
    } else if (currentTrendStrength === "RANGING") {
        contextualSignalAdjustments.meanRev = (contextualSignalAdjustments.meanRev || 1.0) * 1.10;
        contextualSignalAdjustments.pattern = (contextualSignalAdjustments.pattern || 1.0) * 1.05;
    }

    // Apply these adjustments to signal weights
    validSignals.forEach(s => {
        const category = getSignalCategory(s.source);
        if (contextualSignalAdjustments[category]) {
            const originalWeight = s.adjustedWeight;
            s.adjustedWeight *= contextualSignalAdjustments[category];
            s.logic = (s.logic || s.source) + ` (CtxAdj:${contextualSignalAdjustments[category].toFixed(2)})`; // Add to logic for debugging
            console.log(`Signal ${s.source} (${category}): Original Weight ${originalWeight.toFixed(5)}, Adjusted to ${s.adjustedWeight.toFixed(5)}`);
        }
    });
    masterLogic.push(`ContextualAdjustmentApplied`);
    // --- END NEW FEATURE ---


    // Analyze consensus among signals
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

    // Apply consensus factor
    bigScore *= consensus.factor;
    smallScore *= (2.0 - consensus.factor); // If consensus factor is high, bigScore gets boosted, smallScore gets reduced

    const totalScore = bigScore + smallScore;
    let finalDecision = totalScore > 0 ? (bigScore >= smallScore ? "BIG" : "SMALL") : (Math.random() > 0.5 ? "BIG" : "SMALL");
    let finalConfidence = totalScore > 0 ? Math.max(bigScore, smallScore) / totalScore : 0.5;

    // Adjust final confidence based on prime time and external data
    finalConfidence = 0.5 + (finalConfidence - 0.5) * (primeTimeSession?.confidence || 1.0) * (realTimeData?.factor || 1.0);

    // Analyze signal consistency and path confluence
    const signalConsistency = analyzeSignalConsistency(validSignals, trendContext);
    const pathConfluence = analyzePathConfluenceStrength(validSignals, finalDecision);
    masterLogic.push(`LAYER 9: Signal Consistency & Path Confluence (Consistency:${signalConsistency.score.toFixed(2)}, Confluence:${pathConfluence.score.toFixed(2)})`);
    
    // Calculate overall uncertainty score and modulate final confidence
    // PQS is now passed to calculateUncertaintyScore to reduce uncertainty if PQS is high
    const uncertainty = calculateUncertaintyScore(trendContext, stability, marketEntropyAnalysis, signalConsistency, pathConfluence, longTermGlobalAccuracy, isReflexiveCorrection, driftState, pqs);
    // Uncertainty factor now considers PQS: higher PQS means less impact from general uncertainty
    const uncertaintyFactor = 1.0 - Math.min(1.0, uncertainty.score / (120.0 + pqs * 50)); // PQS can reduce the effective uncertainty score threshold
    finalConfidence = 0.5 + (finalConfidence - 0.5) * uncertaintyFactor;
    masterLogic.push(`LAYER 10: Uncertainty Modulation & Final Calibration (Uncertainty Score:${uncertainty.score.toFixed(0)}, Factor:${uncertaintyFactor.toFixed(2)}; Reasons:${uncertainty.reasons})`);

    // Calculate Prediction Quality Score (PQS)
    let pqs = 0.5;
    pqs += (signalConsistency.score - 0.5) * 0.4; // Higher consistency, higher PQS
    pqs += pathConfluence.score * 1.2; // Higher confluence, higher PQS
    pqs = Math.max(0.01, Math.min(0.99, pqs - (uncertainty.score / 500))); // Reduce PQS based on overall uncertainty
    masterLogic.push(`PQS:${pqs.toFixed(3)}`);

    // Define confidence level thresholds, adjusted for prime time
    let highConfThreshold = 0.78, medConfThreshold = 0.65;
    let highPqsThreshold = 0.75, medPqsThreshold = 0.60;

    if (primeTimeSession) {
        highConfThreshold = 0.72; // Slightly lower thresholds during prime time
        medConfThreshold = 0.60;
        highPqsThreshold = 0.70;
        medPqsThreshold = 0.55;
    }

    let confidenceLevel = 1;
    if (finalConfidence > medConfThreshold && pqs > medPqsThreshold) {
        confidenceLevel = 2;
    }
    if (finalConfidence > highConfThreshold && pqs > highPqsThreshold) {
        confidenceLevel = 3;
    }

    // Force prediction to low confidence if uncertainty is too high or PQS is too low
    const uncertaintyThreshold = isReflexiveCorrection || driftState === 'DRIFT' ? 65 : 95;
    const isForced = uncertainty.score >= uncertaintyThreshold || pqs < 0.20;
    if(isForced) {
        confidenceLevel = 1;
        finalConfidence = 0.5 + (Math.random() - 0.5) * 0.02; // Force near 50% confidence for random pick
        masterLogic.push(`FORCED_PREDICTION(Uncertainty:${uncertainty.score}/${uncertaintyThreshold},PQS:${pqs})`);
    }

    // Ensure display confidences are always between 0 and 1
    const bigDisplayConfidence = finalDecision === "BIG" ? finalConfidence : 1 - finalConfidence;
    const smallDisplayConfidence = finalDecision === "SMALL" ? finalConfidence : 1 - finalConfidence;

    const output = {
        predictions: {
            BIG: { confidence: Math.max(0.001, Math.min(0.999, bigDisplayConfidence)), logic: "EnsembleV46.0.3" },
            SMALL: { confidence: Math.max(0.001, Math.min(0.999, smallDisplayConfidence)), logic: "EnsembleV46.0.3" }
        },
        finalDecision,
        finalConfidence,
        confidenceLevel,
        isForcedPrediction: isForced,
        overallLogic: masterLogic.join(' -> '),
        source: "RealTimeFusionV46.0.3",
        // Limit contributing signals for output clarity
        contributingSignals: validSignals.map(s => ({ source: s.source, prediction: s.prediction, weight: s.adjustedWeight.toFixed(5), logic: s.logic || '' })).sort((a,b)=>b.weight-a.weight).slice(0, 15),
        currentMacroRegime,
        marketEntropyState: marketEntropyAnalysis.state,
        predictionQualityScore: pqs,
        // Store last state for next prediction cycle
        lastPredictedOutcome: finalDecision,
        lastFinalConfidence: finalConfidence,
        lastConfidenceLevel: confidenceLevel,
        lastMacroRegime: currentMacroRegime,
        lastPredictionSignals: validSignals.map(s => ({ source: s.source, prediction: s.prediction, weight: s.adjustedWeight, isOnProbation: s.isOnProbation || false })),
        lastConcentrationModeEngaged: concentrationModeEngaged,
        lastMarketEntropyState: marketEntropyAnalysis.state,
        lastVolatilityRegime: trendContext.volatility,
        periodFull: currentPeriodFull, // Store the period ID for performance tracking
        aurochsState: updatedAurochsState // Store updated aurochs state
    };

    console.log(`QAScore v46.0.3 Output: ${output.finalDecision} @ ${(output.finalConfidence * 100).toFixed(1)}% | Lvl: ${output.confidenceLevel} | PQS: ${output.predictionQualityScore.toFixed(2)} | Forced: ${output.isForcedPrediction} | Drift: ${driftState}`);
    return output;
}


// Ensure it's available for Node.js environments
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        ultraAIPredict,
        getBigSmallFromNumber
    };
}
