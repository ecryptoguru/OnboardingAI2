/**
 * Central helpers for reading and validating environment variables at call time.
 * Always read process.env inside the function body, not at module load time,
 * because Convex V8 isolates may not have env vars available during evaluation.
 */

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. Set it with: npx convex env set ${name} <value>`,
    );
  }
  return value.trim();
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export function getOptionalNumber(
  name: string,
  options?: { min?: number; max?: number },
): number | undefined {
  const raw = getOptionalEnv(name);
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    console.warn(`[env] ${name} is not a valid number: "${raw}". Ignoring.`);
    return undefined;
  }
  if (options?.min !== undefined && parsed < options.min) {
    console.warn(
      `[env] ${name}=${parsed} is below the allowed minimum ${options.min}. Using minimum.`,
    );
    return options.min;
  }
  if (options?.max !== undefined && parsed > options.max) {
    console.warn(
      `[env] ${name}=${parsed} is above the allowed maximum ${options.max}. Using maximum.`,
    );
    return options.max;
  }
  return parsed;
}

export function getOptionalBoolean(name: string): boolean {
  return getOptionalEnv(name) === "true";
}
