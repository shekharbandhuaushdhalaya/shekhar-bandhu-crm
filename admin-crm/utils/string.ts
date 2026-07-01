export const shortenPartyName = (name: string, isMobile: boolean = true): string => {
  if (!name) return 'N/A';
  if (!isMobile) return name;
  
  let cleaned = name.replace(/\s+/g, ' ');
  const suffixesToRemove = [
    /\bpvt\.?\s*ltd\.?/gi,
    /\bprivate\s+limited/gi,
    /\bltd\.?/gi,
    /\blimited/gi,
    /\bhealthcare/gi,
    /\bindustries/gi,
    /\benterprises?/gi,
    /\bsolutions?/gi,
    /\bassociates?/gi,
    /\bcorp\.?/gi,
    /\bco\.?/gi,
    /\bcompany/gi
  ];
  
  suffixesToRemove.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  cleaned = cleaned.trim().replace(/[\s,.-]+$/, '').trim();
  
  if (name.length > 20 && cleaned.length > 18) {
    const words = cleaned.split(' ');
    if (words.length > 2) {
      cleaned = words.slice(0, 2).join(' ');
    } else {
      cleaned = cleaned.substring(0, 18);
    }
  }
  
  if (cleaned.toLowerCase() !== name.toLowerCase()) {
    return cleaned + '...';
  }
  
  return cleaned;
};
