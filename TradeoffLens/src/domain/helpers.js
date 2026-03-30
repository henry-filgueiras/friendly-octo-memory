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
export function createId(prefix) {
    if (prefix === void 0) { prefix = "tl"; }
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return "".concat(prefix, "-").concat(crypto.randomUUID());
    }
    return "".concat(prefix, "-").concat(Math.random().toString(36).slice(2, 10));
}
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function createCandidate(name) {
    if (name === void 0) { name = "New candidate"; }
    return {
        id: createId("candidate"),
        name: name,
        notes: "",
        values: {},
    };
}
function createEnumOptions() {
    return [
        { id: createId("option"), label: "High", score: 100 },
        { id: createId("option"), label: "Medium", score: 60 },
        { id: createId("option"), label: "Low", score: 20 },
    ];
}
export function createCriterion(type) {
    if (type === void 0) { type = "numeric"; }
    var base = {
        id: createId("criterion"),
        name: "New criterion",
        weight: type === "note" ? 0 : 50,
        constraintEnabled: false,
    };
    switch (type) {
        case "numeric":
            return __assign(__assign({}, base), { type: type, direction: "maximize", minConstraint: null, maxConstraint: null });
        case "boolean":
            return __assign(__assign({}, base), { type: type, direction: "maximize", requiredValue: true });
        case "enum":
            return __assign(__assign({}, base), { type: type, options: createEnumOptions(), allowedValues: [] });
        case "note":
            return __assign(__assign({}, base), { type: type, constraintEnabled: false });
    }
}
export function getDefaultValueForCriterion(criterion) {
    var _a, _b;
    switch (criterion.type) {
        case "numeric":
            return null;
        case "boolean":
            return null;
        case "enum":
            return (_b = (_a = criterion.options[0]) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : "";
        case "note":
            return "";
    }
}
export function convertCriterionType(criterion, nextType) {
    var converted = createCriterion(nextType);
    return __assign(__assign({}, converted), { id: criterion.id, name: criterion.name, weight: nextType === "note" ? 0 : criterion.weight });
}
export function cloneCandidate(candidate) {
    return __assign(__assign({}, candidate), { id: createId("candidate"), name: "".concat(candidate.name, " copy"), values: __assign({}, candidate.values) });
}
export function syncScenario(scenario) {
    var criteriaById = new Map(scenario.criteria.map(function (criterion) { return [criterion.id, criterion]; }));
    var candidates = scenario.candidates.map(function (candidate) {
        var values = {};
        scenario.criteria.forEach(function (criterion) {
            var currentValue = candidate.values[criterion.id];
            values[criterion.id] =
                currentValue === undefined ? getDefaultValueForCriterion(criterion) : currentValue;
        });
        return __assign(__assign({}, candidate), { values: values });
    });
    var criteria = scenario.criteria.map(function (criterion) {
        if (criterion.type !== "enum") {
            return criterion;
        }
        var optionLabels = criterion.options.map(function (option) { return option.label; });
        var allowedValues = criterion.allowedValues.filter(function (value) { return optionLabels.includes(value); });
        return __assign(__assign({}, criterion), { allowedValues: allowedValues });
    });
    return __assign(__assign({}, scenario), { criteria: criteria, candidates: candidates });
}
export function touchScenario(scenario) {
    return __assign(__assign({}, syncScenario(scenario)), { updatedAt: new Date().toISOString() });
}
export function createEmptyScenario() {
    var now = new Date().toISOString();
    return {
        id: createId("scenario"),
        name: "Untitled decision",
        description: "Compare options with explicit weights, constraints, and explanations.",
        candidates: [],
        criteria: [],
        createdAt: now,
        updatedAt: now,
    };
}
export function createScenarioFromSeed(seed) {
    var now = new Date().toISOString();
    return syncScenario(__assign(__assign({}, seed), { id: createId("scenario"), createdAt: now, updatedAt: now }));
}
export function formatNumber(value) {
    if (Number.isInteger(value)) {
        return value.toString();
    }
    return value.toFixed(2).replace(/\.00$/, "");
}
export function updateEnumOptionLabels(criterion, nextOptions) {
    var allowedLookup = new Set(criterion.allowedValues);
    var allowedValues = nextOptions
        .map(function (option) { return option.label; })
        .filter(function (label) { return allowedLookup.has(label); });
    return __assign(__assign({}, criterion), { options: nextOptions, allowedValues: allowedValues });
}
