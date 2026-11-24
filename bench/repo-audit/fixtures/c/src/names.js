export function toConstantCase(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

export function toCamel(name) {
  return name.toLowerCase().replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}
