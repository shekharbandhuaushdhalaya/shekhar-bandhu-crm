const OPTION_KEYS = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'hidden'
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function optionValue(options, key) {
  if (key === 'unique' || key === 'sparse' || key === 'hidden') return options[key] === true;
  return options[key] === undefined ? null : options[key];
}

function compareIndexes(expectedIndexes, actualIndexes) {
  const missing = [];
  const mismatched = [];

  for (const [keys, expectedOptions = {}] of expectedIndexes) {
    const candidates = actualIndexes.filter(index => stableStringify(index.key) === stableStringify(keys));
    const expected = {};
    const actual = {};
    const differences = [];

    for (const key of OPTION_KEYS) {
      const expectedValue = optionValue(expectedOptions, key);
      const actualValues = candidates.map(index => optionValue(index, key));
      expected[key] = expectedValue;
      actual[key] = actualValues;

      if (candidates.length && !actualValues.some(value => stableStringify(value) === stableStringify(expectedValue))) {
        differences.push({ option: key, expected: expectedValue, actual: actualValues });
      }
    }

    if (expectedOptions.name) {
      const names = candidates.map(index => index.name);
      if (!names.includes(expectedOptions.name)) {
        differences.push({ option: 'name', expected: expectedOptions.name, actual: names });
      }
    }

    if (!candidates.length) {
      missing.push({ keys, options: expectedOptions });
    } else if (differences.length) {
      mismatched.push({ keys, expected, actual, differences });
    }
  }

  return { missing, mismatched };
}

module.exports = { compareIndexes, stableStringify };
