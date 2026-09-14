import { authStorage } from '../utils/storage';

// Storage key used to persist the last-known firm/company configuration
// so it's available immediately on app boot, before the API call resolves.
const FIRM_DETAILS_STORAGE_KEY = 'vp_crm_firm_details';

export type FirmDetails = {
  name: string;
  address: string;
  email: string;
  phone: string;
  gstin: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  bankUpi: string;
  invoicePrefix: string;
  quotationPrefix: string;
  challanPrefix: string;
  dispatchPrefix: string;
  defaultTerms: string;
  defaultGstRate: number;
  signatureBase64: string;
  signatureUrl: string;
  qrImageBase64: string;
  qrImageUrl: string;
  dscSignatoryName: string;
  dscCertificateName: string;
  manufacturingLicenseNo: string;
  gmpCertificateNo: string;
  licenseValidTill: string;
  gmpValidTill: string;
};

const DEFAULT_FIRM_DETAILS: FirmDetails = {
  name: '',
  address: '',
  email: '',
  phone: '',
  gstin: '',
  bankName: '',
  bankAccountNo: '',
  bankIfsc: '',
  bankBranch: '',
  bankUpi: '',
  invoicePrefix: '',
  quotationPrefix: '',
  challanPrefix: '',
  dispatchPrefix: '',
  defaultTerms: '',
  defaultGstRate: 18,
  signatureBase64: '',
  signatureUrl: '',
  qrImageBase64: '',
  qrImageUrl: '',
  dscSignatoryName: 'Authorised Representative',
  dscCertificateName: 'eMudhra / Class 3 DSC',
  manufacturingLicenseNo: '',
  gmpCertificateNo: '',
  licenseValidTill: '',
  gmpValidTill: '',
};

// Mutable, in-memory "active" firm details object.
// Kept as a stable object reference (not reassigned) so that any module
// which imported FIRM_DETAILS continues to see live updates after
// updateActiveFirmDetails() mutates its fields.
export const FIRM_DETAILS: FirmDetails = { ...DEFAULT_FIRM_DETAILS };

/**
 * Merge a partial/raw config (e.g. the response of api.getSystemSettings())
 * into the in-memory FIRM_DETAILS object, and persist it to local storage
 * so it can be restored instantly on next app boot.
 */
export const updateActiveFirmDetails = (config: Partial<FirmDetails> & Record<string, any>): void => {
  if (!config) return;

  Object.assign(FIRM_DETAILS, {
    name: config.firmName ?? config.name ?? FIRM_DETAILS.name,
    address: config.firmAddress ?? config.address ?? FIRM_DETAILS.address,
    email: config.firmEmail ?? config.email ?? FIRM_DETAILS.email,
    phone: config.firmPhone ?? config.phone ?? FIRM_DETAILS.phone,
    gstin: config.firmGstin ?? config.gstin ?? FIRM_DETAILS.gstin,
    bankName: config.bankName ?? FIRM_DETAILS.bankName,
    bankAccountNo: config.bankAccountNo ?? FIRM_DETAILS.bankAccountNo,
    bankIfsc: config.bankIfsc ?? FIRM_DETAILS.bankIfsc,
    bankBranch: config.bankBranch ?? FIRM_DETAILS.bankBranch,
    bankUpi: config.bankUpi ?? FIRM_DETAILS.bankUpi,
    invoicePrefix: config.invoicePrefix ?? FIRM_DETAILS.invoicePrefix,
    quotationPrefix: config.quotationPrefix ?? FIRM_DETAILS.quotationPrefix,
    challanPrefix: config.challanPrefix ?? FIRM_DETAILS.challanPrefix,
    dispatchPrefix: config.dispatchPrefix ?? FIRM_DETAILS.dispatchPrefix,
    defaultTerms: config.defaultTerms ?? FIRM_DETAILS.defaultTerms,
    defaultGstRate:
      config.defaultGstRate !== undefined && config.defaultGstRate !== null
        ? Number(config.defaultGstRate)
        : FIRM_DETAILS.defaultGstRate,
    signatureBase64: config.signatureBase64 ?? FIRM_DETAILS.signatureBase64,
    signatureUrl: config.signatureUrl ?? FIRM_DETAILS.signatureUrl,
    qrImageBase64: config.qrImageBase64 ?? FIRM_DETAILS.qrImageBase64,
    qrImageUrl: config.qrImageUrl ?? FIRM_DETAILS.qrImageUrl,
    dscSignatoryName: config.dscSignatoryName ?? FIRM_DETAILS.dscSignatoryName,
    dscCertificateName: config.dscCertificateName ?? FIRM_DETAILS.dscCertificateName,
    manufacturingLicenseNo: config.manufacturingLicenseNo ?? FIRM_DETAILS.manufacturingLicenseNo,
    gmpCertificateNo: config.gmpCertificateNo ?? FIRM_DETAILS.gmpCertificateNo,
    licenseValidTill: config.licenseValidTill ?? FIRM_DETAILS.licenseValidTill,
    gmpValidTill: config.gmpValidTill ?? FIRM_DETAILS.gmpValidTill,
  });

  authStorage.setItem(FIRM_DETAILS_STORAGE_KEY, JSON.stringify(FIRM_DETAILS)).catch((err) => {
    console.error('Failed to persist firm details to storage:', err);
  });
};

/**
 * Restore the last-known firm details from local storage into the
 * in-memory FIRM_DETAILS object. Called once on app boot (see utils/auth.tsx)
 * so screens have firm/company info available before the network call
 * to fetch fresh settings completes.
 */
export const loadFirmDetailsFromStorage = async (): Promise<void> => {
  try {
    const stored = await authStorage.getItem(FIRM_DETAILS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.assign(FIRM_DETAILS, DEFAULT_FIRM_DETAILS, parsed);
    }
  } catch (err) {
    console.error('Failed to load firm details from storage:', err);
  }
};