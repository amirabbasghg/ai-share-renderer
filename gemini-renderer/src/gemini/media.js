export function mediaFromValue(value) {
  const found = [];

  function visit(node) {
    if (
      Array.isArray(node)
    ) {
      for (
        const child of node
      ) {
        visit(child);
      }

      return;
    }

    if (
      node !== null &&
      typeof node === "object"
    ) {
      for (
        const child of Object.values(node)
      ) {
        visit(child);
      }

      return;
    }

    if (
      typeof node !== "string" ||
      !node.startsWith("http")
    ) {
      return;
    }

    const lowered =
      node.toLowerCase();

    if (
      lowered.includes(
        "googleusercontent.com"
      ) ||
      /\.(png|jpe?g|webp|gif)([?#]|$)/i.test(
        node
      )
    ) {
      found.push({
        type: "image",
        url: node,
      });

    } else if (
      /\.(mp4|webm)([?#]|$)/i.test(node)
    ) {
      found.push({
        type: "video",
        url: node,
      });
    }
  }

  visit(value);

  return found;
}
