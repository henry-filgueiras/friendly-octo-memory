var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { clamp, formatNumber } from "./helpers";
var EPSILON = 1e-9;
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
export function isScoredCriterion(criterion) {
    return criterion.type !== "note" && criterion.weight > 0;
}
export function normalizeNumericValue(value, min, max, direction) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
        return 0;
    }
    if (Math.abs(max - min) < EPSILON) {
        return 1;
    }
    var ratio = direction === "maximize"
        ? (value - min) / (max - min)
        : (max - value) / (max - min);
    return clamp(ratio, 0, 1);
}
function formatValue(value) {
    if (value === null || value === "") {
        return "Unset";
    }
    if (typeof value === "number") {
        return formatNumber(value);
    }
    if (typeof value === "boolean") {
        return value ? "True" : "False";
    }
    return value;
}
function getConstraintReasons(candidate, criterion) {
    if (!criterion.constraintEnabled) {
        return [];
    }
    var value = candidate.values[criterion.id];
    switch (criterion.type) {
        case "numeric": {
            if (!isFiniteNumber(value)) {
                return ["".concat(criterion.name, " needs a numeric value to evaluate the hard constraint.")];
            }
            var reasons = [];
            if (criterion.minConstraint !== null && value < criterion.minConstraint) {
                reasons.push("".concat(criterion.name, " must be at least ").concat(formatNumber(criterion.minConstraint), "."));
            }
            if (criterion.maxConstraint !== null && value > criterion.maxConstraint) {
                reasons.push("".concat(criterion.name, " must be at most ").concat(formatNumber(criterion.maxConstraint), "."));
            }
            return reasons;
        }
        case "boolean": {
            if (typeof value !== "boolean") {
                return ["".concat(criterion.name, " must be explicitly set for the hard constraint.")];
            }
            if (value !== criterion.requiredValue) {
                return ["".concat(criterion.name, " must be ").concat(criterion.requiredValue ? "true" : "false", ".")];
            }
            return [];
        }
        case "enum": {
            if (typeof value !== "string" || value.trim().length === 0) {
                return ["".concat(criterion.name, " must be set to one of the allowed values.")];
            }
            if (!criterion.allowedValues.includes(value)) {
                return [
                    "".concat(criterion.name, " must be one of: ").concat(criterion.allowedValues.join(", ") || "none selected", "."),
                ];
            }
            return [];
        }
        case "note":
            return [];
    }
}
function buildNumericMeta(criteria, candidates) {
    var numericMetaByCriterionId = {};
    criteria.forEach(function (criterion) {
        if (criterion.type !== "numeric" || criterion.weight <= 0) {
            return;
        }
        var values = candidates
            .map(function (candidate) { return candidate.values[criterion.id]; })
            .filter(isFiniteNumber);
        var min = values.length > 0 ? Math.min.apply(Math, values) : 0;
        var max = values.length > 0 ? Math.max.apply(Math, values) : 0;
        numericMetaByCriterionId[criterion.id] = {
            criterionId: criterion.id,
            min: min,
            max: max,
            hasSpread: Math.abs(max - min) >= EPSILON,
        };
    });
    return numericMetaByCriterionId;
}
function getEnumUtility(candidateValue, criterion) {
    if (criterion.type !== "enum") {
        return 0;
    }
    if (typeof candidateValue !== "string") {
        return 0;
    }
    var option = criterion.options.find(function (entry) { return entry.label === candidateValue; });
    return option ? clamp(option.score / 100, 0, 1) : 0;
}
function getBooleanUtility(candidateValue, criterion) {
    if (criterion.type !== "boolean" || typeof candidateValue !== "boolean") {
        return 0;
    }
    var preferredValue = criterion.direction === "maximize";
    return candidateValue === preferredValue ? 1 : 0;
}
function getNumericUtility(candidateValue, criterion, numericMetaByCriterionId) {
    if (!isFiniteNumber(candidateValue)) {
        return 0;
    }
    var meta = numericMetaByCriterionId[criterion.id];
    return normalizeNumericValue(candidateValue, meta.min, meta.max, criterion.direction);
}
function getUtility(candidateValue, criterion, numericMetaByCriterionId) {
    switch (criterion.type) {
        case "numeric": {
            var utility = getNumericUtility(candidateValue, criterion, numericMetaByCriterionId);
            return {
                utility: utility,
                normalizedValue: utility,
                displayValue: formatValue(candidateValue),
            };
        }
        case "boolean": {
            var utility = getBooleanUtility(candidateValue, criterion);
            return {
                utility: utility,
                normalizedValue: utility,
                displayValue: formatValue(candidateValue),
            };
        }
        case "enum": {
            var utility = getEnumUtility(candidateValue, criterion);
            return {
                utility: utility,
                normalizedValue: utility,
                displayValue: formatValue(candidateValue),
            };
        }
        case "note":
            return {
                utility: 0,
                normalizedValue: null,
                displayValue: formatValue(candidateValue),
            };
    }
}
function buildCandidateScore(candidate, criteria, totalActiveWeight, numericMetaByCriterionId) {
    var contributions = [];
    var utilityByCriterionId = {};
    criteria.forEach(function (criterion) {
        var _a;
        if (!isScoredCriterion(criterion)) {
            return;
        }
        var value = (_a = candidate.values[criterion.id]) !== null && _a !== void 0 ? _a : null;
        var _b = getUtility(value, criterion, numericMetaByCriterionId), utility = _b.utility, normalizedValue = _b.normalizedValue, displayValue = _b.displayValue;
        var weightedPoints = utility * criterion.weight;
        utilityByCriterionId[criterion.id] = utility;
        contributions.push({
            criterionId: criterion.id,
            criterionName: criterion.name,
            criterionType: criterion.type,
            weight: criterion.weight,
            rawValue: value,
            utility: utility,
            normalizedValue: normalizedValue,
            weightedPoints: weightedPoints,
            displayValue: displayValue,
        });
    });
    var totalWeightedPoints = contributions.reduce(function (sum, contribution) { return sum + contribution.weightedPoints; }, 0);
    return {
        candidate: candidate,
        totalWeightedPoints: totalWeightedPoints,
        totalScore: totalActiveWeight > 0 ? (totalWeightedPoints / totalActiveWeight) * 100 : 0,
        contributions: contributions,
        utilityByCriterionId: utilityByCriterionId,
        rank: 0,
    };
}
function detectDominance(ranking, criteria) {
    var scoredCriteria = criteria.filter(isScoredCriterion);
    var pairs = [];
    if (scoredCriteria.length === 0) {
        return pairs;
    }
    ranking.forEach(function (rowCandidate) {
        ranking.forEach(function (columnCandidate) {
            if (rowCandidate.candidate.id === columnCandidate.candidate.id) {
                return;
            }
            var allEqualOrBetter = scoredCriteria.every(function (criterion) {
                var _a, _b;
                var rowUtility = (_a = rowCandidate.utilityByCriterionId[criterion.id]) !== null && _a !== void 0 ? _a : 0;
                var columnUtility = (_b = columnCandidate.utilityByCriterionId[criterion.id]) !== null && _b !== void 0 ? _b : 0;
                return rowUtility + EPSILON >= columnUtility;
            });
            var strictlyBetterSomewhere = scoredCriteria.some(function (criterion) {
                var _a, _b;
                var rowUtility = (_a = rowCandidate.utilityByCriterionId[criterion.id]) !== null && _a !== void 0 ? _a : 0;
                var columnUtility = (_b = columnCandidate.utilityByCriterionId[criterion.id]) !== null && _b !== void 0 ? _b : 0;
                return rowUtility > columnUtility + EPSILON;
            });
            if (allEqualOrBetter && strictlyBetterSomewhere) {
                pairs.push({
                    dominatorId: rowCandidate.candidate.id,
                    dominatedId: columnCandidate.candidate.id,
                });
            }
        });
    });
    return pairs;
}
function buildPairwise(ranking, dominancePairs) {
    var dominanceLookup = new Map(dominancePairs.map(function (pair) { return ["".concat(pair.dominatorId, ":").concat(pair.dominatedId), true]; }));
    return ranking.flatMap(function (rowCandidate) {
        return ranking.map(function (columnCandidate) {
            var delta = rowCandidate.totalScore - columnCandidate.totalScore;
            var dominance = dominanceLookup.get("".concat(rowCandidate.candidate.id, ":").concat(columnCandidate.candidate.id))
                ? "row"
                : dominanceLookup.get("".concat(columnCandidate.candidate.id, ":").concat(rowCandidate.candidate.id))
                    ? "column"
                    : null;
            return {
                rowCandidateId: rowCandidate.candidate.id,
                columnCandidateId: columnCandidate.candidate.id,
                delta: delta,
                winnerId: Math.abs(delta) < EPSILON
                    ? null
                    : delta > 0
                        ? rowCandidate.candidate.id
                        : columnCandidate.candidate.id,
                dominance: dominance,
            };
        });
    });
}
export function analyzeScenario(scenario, weightOverrides) {
    if (weightOverrides === void 0) { weightOverrides = {}; }
    var criteria = scenario.criteria.map(function (criterion) {
        var _a;
        return isScoredCriterion(criterion)
            ? __assign(__assign({}, criterion), { weight: clamp((_a = weightOverrides[criterion.id]) !== null && _a !== void 0 ? _a : criterion.weight, 0, 100) }) : criterion;
    });
    var excluded = scenario.candidates
        .map(function (candidate) { return ({
        candidate: candidate,
        reasons: criteria.flatMap(function (criterion) { return getConstraintReasons(candidate, criterion); }),
    }); })
        .filter(function (entry) { return entry.reasons.length > 0; });
    var includedCandidates = scenario.candidates.filter(function (candidate) { return !excluded.some(function (entry) { return entry.candidate.id === candidate.id; }); });
    var numericMetaByCriterionId = buildNumericMeta(criteria, includedCandidates);
    var totalActiveWeight = criteria
        .filter(isScoredCriterion)
        .reduce(function (sum, criterion) { return sum + criterion.weight; }, 0);
    var ranking = includedCandidates
        .map(function (candidate) {
        return buildCandidateScore(candidate, criteria, totalActiveWeight, numericMetaByCriterionId);
    })
        .sort(function (left, right) {
        if (Math.abs(right.totalScore - left.totalScore) > EPSILON) {
            return right.totalScore - left.totalScore;
        }
        return left.candidate.name.localeCompare(right.candidate.name);
    })
        .map(function (entry, index) { return (__assign(__assign({}, entry), { rank: index + 1 })); });
    var dominancePairs = detectDominance(ranking, criteria);
    var pairwise = buildPairwise(ranking, dominancePairs);
    return {
        ranking: ranking,
        excluded: excluded,
        numericMetaByCriterionId: numericMetaByCriterionId,
        totalActiveWeight: totalActiveWeight,
        dominancePairs: dominancePairs,
        pairwise: pairwise,
    };
}
export function getDominatedIds(dominancePairs, dominatorId) {
    return dominancePairs
        .filter(function (pair) { return pair.dominatorId === dominatorId; })
        .map(function (pair) { return pair.dominatedId; });
}
export function getDominators(dominancePairs, candidateId) {
    return dominancePairs
        .filter(function (pair) { return pair.dominatedId === candidateId; })
        .map(function (pair) { return pair.dominatorId; });
}
export function computeParetoFrontier(scenario, analysis, xCriterionId, yCriterionId) {
    var xCriterion = scenario.criteria.find(function (criterion) { return criterion.id === xCriterionId && criterion.type === "numeric"; });
    var yCriterion = scenario.criteria.find(function (criterion) { return criterion.id === yCriterionId && criterion.type === "numeric"; });
    if (!xCriterion || !yCriterion) {
        return [];
    }
    var points = analysis.ranking
        .map(function (entry) {
        var xValue = entry.candidate.values[xCriterionId];
        var yValue = entry.candidate.values[yCriterionId];
        if (!isFiniteNumber(xValue) || !isFiniteNumber(yValue)) {
            return null;
        }
        var xUtility = getNumericUtility(xValue, xCriterion, analysis.numericMetaByCriterionId);
        var yUtility = getNumericUtility(yValue, yCriterion, analysis.numericMetaByCriterionId);
        return {
            candidateId: entry.candidate.id,
            candidateName: entry.candidate.name,
            xCriterionId: xCriterionId,
            yCriterionId: yCriterionId,
            xValue: xValue,
            yValue: yValue,
            xUtility: xUtility,
            yUtility: yUtility,
            onFrontier: false,
        };
    })
        .filter(function (point) { return point !== null; });
    return points.map(function (point) {
        var dominated = points.some(function (otherPoint) {
            if (otherPoint.candidateId === point.candidateId) {
                return false;
            }
            var equalOrBetter = otherPoint.xUtility + EPSILON >= point.xUtility &&
                otherPoint.yUtility + EPSILON >= point.yUtility;
            var strictlyBetter = otherPoint.xUtility > point.xUtility + EPSILON ||
                otherPoint.yUtility > point.yUtility + EPSILON;
            return equalOrBetter && strictlyBetter;
        });
        return __assign(__assign({}, point), { onFrontier: !dominated });
    });
}
