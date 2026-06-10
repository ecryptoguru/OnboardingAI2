export function normalizeIndianPhone(phone: string): string | null {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 12) return null;
  if (/^(\d)\1+$/.test(digits)) return null;

  if (digits.length === 10) {
    return /^[6-9]/.test(digits) ? `+91${digits}` : null;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (/^[6-9]/.test(rest)) {
      return `+91${rest}`;
    }
    const landlinePatterns = [2, 3, 4];
    const stdLength =
      landlinePatterns.find((length) => {
        const subscriberLength = rest.length - length;
        return subscriberLength >= 6 && subscriberLength <= 8;
      }) ?? 3;
    const subscriber = rest.slice(stdLength);
    if (subscriber.length >= 6 && subscriber.length <= 8) {
      return `+91-${rest.slice(0, stdLength)}-${subscriber}`;
    }
    return null;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    const national = digits.slice(2);
    if (/^[6-9]/.test(national)) {
      return `+91${national}`;
    }
    return null;
  }

  return null;
}

export function isValidIndianPhone(phone: string): boolean {
  return normalizeIndianPhone(phone) !== null;
}
