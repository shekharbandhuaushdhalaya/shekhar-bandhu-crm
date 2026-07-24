export const GST_STATE_CODES: { [key: string]: string } = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

export const getStateStrWithCode = (stateName?: string) => {
  if (!stateName) return 'Uttar Pradesh (09)';
  
  const cleanState = stateName.trim().toLowerCase();
  
  // Handle common aliases
  if (cleanState === 'up' || cleanState === 'u.p.') return 'Uttar Pradesh (09)';

  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    if (name.toLowerCase() === cleanState) {
      return `${name} (${code})`;
    }
  }
  
  return stateName; // Fallback if no match
};

/**
 * Validates a GSTIN string and cross-checks state code compatibility.
 * Returns { valid: boolean, stateCode?: string, expectedState?: string, error?: string }
 */
export const validateGstinWithState = (gstin?: string, selectedStateName?: string): { valid: boolean; stateCode?: string; expectedState?: string; error?: string } => {
  if (!gstin || !gstin.trim()) {
    return { valid: true }; // Empty GSTIN is allowed for unregistered/cash parties
  }

  const clean = gstin.trim().toUpperCase();

  // 1. Standard Indian 15-digit GSTIN Regex
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(clean)) {
    return {
      valid: false,
      error: `Invalid GSTIN format "${clean}". Must be 15 characters (e.g. 09AAAAA1111A1Z1).`
    };
  }

  // 2. Extract State Code (First 2 digits)
  const stateCode = clean.substring(0, 2);
  const expectedState = GST_STATE_CODES[stateCode];

  if (!expectedState) {
    return {
      valid: false,
      stateCode,
      error: `Invalid GST State Code "${stateCode}" in GSTIN.`
    };
  }

  // 3. Cross-validate state code against selected State Name if provided
  if (selectedStateName && selectedStateName.trim()) {
    const normSelected = selectedStateName.trim().toLowerCase();
    const normExpected = expectedState.toLowerCase();

    // Alias mapping checks
    const isUpMatch = (normSelected === 'up' || normSelected === 'u.p.' || normSelected === 'uttar pradesh') && stateCode === '09';
    const isExactMatch = normExpected === normSelected || normSelected.includes(normExpected) || normExpected.includes(normSelected);

    if (!isUpMatch && !isExactMatch) {
      return {
        valid: false,
        stateCode,
        expectedState,
        error: `GSTIN state code "${stateCode}" belongs to ${expectedState}, but the state is set to "${selectedStateName}". (e.g. Code "09" is for Uttar Pradesh, not ${selectedStateName}).`
      };
    }
  }

  return {
    valid: true,
    stateCode,
    expectedState
  };
};
