import { authStorage } from '../utils/storage';
import { api } from '../utils/api';

const DEFAULT_FIRM_DETAILS = {
  name: "SHEKHAR BANDHU AUSHADHALAYA",
  address: "PILIKOTHI, VARANASI (U.P.)",
  email: "info@shekharbandhuaushadhalaya.in",
  phone: "+91-9450371661",
  gstin: "09ABKFS1983L1Z4",
  bankName: "Bank of India",
  bankAccountNo: "691527110000080",
  bankIfsc: "BKID0006915",
  bankBranch: "Lohatiya, Varanasi",
  bankUpi: "",
  invoicePrefix: "SB",
  quotationPrefix: "QT",
  challanPrefix: "CH",
  dispatchPrefix: "DP",
  defaultTerms: `1. All disputes are subject to "VARANASI" Jurisdiction only.\n2. Goods despatched at your risk and responsibility. Kindly retire the documents on presentation.\n3. We do not accept any responsibility for any loss/damages once the goods are delivered to the carriers.\n4. Interest @ 18% p.a. will be charged if the payment is not made within the stipulated time.\n5. Goods once sold will not be taken back.`,
  defaultGstRate: 18,
};

let activeSettings = { ...DEFAULT_FIRM_DETAILS };

export const FIRM_DETAILS = {
  get name() { return activeSettings.name; },
  get address() { return activeSettings.address; },
  get email() { return activeSettings.email; },
  get phone() { return activeSettings.phone; },
  get gstin() { return activeSettings.gstin; },
  get bankName() { return activeSettings.bankName; },
  get bankAccountNo() { return activeSettings.bankAccountNo; },
  get bankIfsc() { return activeSettings.bankIfsc; },
  get bankBranch() { return activeSettings.bankBranch; },
  get bankUpi() { return activeSettings.bankUpi; },
  get invoicePrefix() { return activeSettings.invoicePrefix; },
  get quotationPrefix() { return activeSettings.quotationPrefix; },
  get challanPrefix() { return activeSettings.challanPrefix; },
  get dispatchPrefix() { return activeSettings.dispatchPrefix; },
  get defaultTerms() { return activeSettings.defaultTerms; },
  get defaultGstRate() { return Number(activeSettings.defaultGstRate) || 18; },
};

export function updateActiveFirmDetails(newSettings: Partial<typeof DEFAULT_FIRM_DETAILS>) {
  activeSettings = { ...activeSettings, ...newSettings };
}

export function getActiveFirmDetails() {
  return activeSettings;
}

export function getDefaultFirmDetails() {
  return DEFAULT_FIRM_DETAILS;
}

export async function loadFirmDetailsFromStorage() {
  try {
    const serverSettings = await api.getSystemSettings();
    if (serverSettings) {
      updateActiveFirmDetails(serverSettings);
      await authStorage.setItem('vp_crm_firm_settings', JSON.stringify(serverSettings));
      return;
    }
  } catch {
    // Offline — fall through to cached settings
  }

  try {
    const stored = await authStorage.getItem('vp_crm_firm_settings');
    if (stored) {
      updateActiveFirmDetails(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to load firm settings from storage:', e);
  }
}
