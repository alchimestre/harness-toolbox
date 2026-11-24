export function isInt(value) {
  return /^-?\d+$/.test(value);
}

export function isPort(value) {
  return isInt(value) && Number(value) >= 1 && Number(value) <= 65535;
}

export function isBool(value) {
  return ['true', 'false', '1', '0'].includes(value.toLowerCase());
}

export function isUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function oneOf(value, values) {
  return values.includes(value);
}

export function isHost(value) {
  return /^[a-z0-9.-]+$/i.test(value);
}
