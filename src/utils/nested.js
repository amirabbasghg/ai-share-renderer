export function safeString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}


export function nested(value, ...indexes) {
  let current = value;

  for (
    const index of indexes
  ) {
    if (
      !Array.isArray(current) ||
      index < 0 ||
      index >= current.length
    ) {
      return null;
    }

    current =
      current[index];
  }

  return current;
}
