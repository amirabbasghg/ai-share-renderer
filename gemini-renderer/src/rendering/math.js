import { escapeHtml } from "../utils/escape.js";

const GREEK = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ϵ",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",

  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const SYMBOLS = {
  pm: "±",
  mp: "∓",
  times: "×",
  cdot: "·",
  div: "÷",
  neq: "≠",
  ne: "≠",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  approx: "≈",
  sim: "∼",
  equiv: "≡",
  propto: "∝",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
 rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  degree: "°",
};

const SUPERSCRIPT = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPT = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

function readGroup(source, start) {
  if (source[start] !== "{") {
    return {
      value: source[start] || "",
      next: start + 1,
    };
  }

  let depth = 0;

  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
    } else if (source[i] === "}") {
      depth--;

      if (depth === 0) {
        return {
          value: source.slice(start + 1, i),
          next: i + 1,
        };
      }
    }
  }

  return {
    value: source.slice(start + 1),
    next: source.length,
  };
}

function toUnicodeScript(value, table) {
  let result = "";

  for (const char of value) {
    result += table[char] || char;
  }

  return result;
}

function renderPlainText(value) {
  let result = "";
  let i = 0;

  while (i < value.length) {
    const char = value[i];

    /*
     * Superscript
     *
     * x^2
     * x^{12}
     */
    if (char === "^") {
      const group = readGroup(
        value,
        i + 1
      );

      const rendered =
        renderExpression(group.value);

      result +=
        `<sup>${rendered}</sup>`;

      i = group.next;
      continue;
    }

    /*
     * Subscript
     *
     * x_1
     * x_{12}
     */
    if (char === "_") {
      const group = readGroup(
        value,
        i + 1
      );

      const rendered =
        renderExpression(group.value);

      result +=
        `<sub>${rendered}</sub>`;

      i = group.next;
      continue;
    }

    result += escapeHtml(char);
    i++;
  }

  return result;
}

function renderCommand(
  command,
  source,
  index
) {
  if (GREEK[command]) {
    return {
      html:
        GREEK[command],
      next: index,
    };
  }

  if (SYMBOLS[command]) {
    return {
      html:
        SYMBOLS[command],
      next: index,
    };
  }

  /*
   * \frac{a}{b}
   */
  if (command === "frac") {
    const numerator =
      readGroup(source, index);

    const denominator =
      readGroup(
        source,
        numerator.next
      );

    return {
      html:
        `${renderExpression(numerator.value)}` +
        `⁄` +
        `${renderExpression(denominator.value)}`,

      next:
        denominator.next,
    };
  }

  /*
   * \sqrt{x}
   *
   * \sqrt[3]{x}
   */
  if (command === "sqrt") {
    let next = index;
    let rootIndex = "";

    if (source[next] === "[") {
      const end =
        source.indexOf("]", next);

      if (end !== -1) {
        rootIndex =
          source.slice(
            next + 1,
            end
          );

        next = end + 1;
      }
    }

    const group =
      readGroup(source, next);

    const content =
      renderExpression(group.value);

    if (rootIndex) {
      return {
        html:
          `<sup>${renderExpression(rootIndex)}</sup>√${content}`,

        next:
          group.next,
      };
    }

    return {
      html:
        `√${content}`,

      next:
        group.next,
    };
  }

  /*
   * \text{hello}
   */
  if (command === "text") {
    const group =
      readGroup(source, index);

    return {
      html:
        escapeHtml(group.value),

      next:
        group.next,
    };
  }

  /*
   * \mathrm{ABC}
   * \mathbf{x}
   * \mathit{x}
   */
  if (
    command === "mathrm" ||
    command === "mathbf" ||
    command === "mathit" ||
    command === "operatorname"
  ) {
    const group =
      readGroup(source, index);

    const content =
      renderExpression(group.value);

    return {
      html:
        content,

      next:
        group.next,
    };
  }

  /*
   * Unknown command:
   * keep its name instead of destroying content.
   */

  if (
  command === "left" ||
  command === "right"
) {
  return {
    html: "",
    next: index,
  };
}

if (
  command === "," ||
  command === ";" ||
  command === ":" ||
  command === "!"
) {
  return {
    html:
      command === "!"
        ? ""
        : " ",
    next: index,
  };
}

if (command === "quad" || command === "qquad") {
  return {
    html: " ",
    next: index,
  };
}
  return {
    html:
      escapeHtml(`\\${command}`),

    next:
      index,
  };
}

export function renderExpression(expression) {
  let result = "";
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];

    /*
     * LaTeX command
     */
    if (char === "\\") {
  const match =
    expression.slice(i + 1).match(/^[A-Za-z]+/);

  if (match) {
    const command = match[0];
    const commandStart =
      i + 1 + command.length;

    const rendered =
      renderCommand(
        command,
        expression,
        commandStart
      );

    result += rendered.html;
    i = rendered.next;
    continue;
  }

  const escaped =
    expression[i + 1];

  if (escaped === ",") {
    result += " ";
    i += 2;
    continue;
  }

  if (escaped === ";") {
    result += " ";
    i += 2;
    continue;
  }

  if (escaped === ":") {
    result += " ";
    i += 2;
    continue;
  }

  if (escaped === "!") {
    i += 2;
    continue;
  }

  if (escaped) {
    result += escapeHtml(escaped);
    i += 2;
    continue;
  }
}

    /*
     * Superscript
     */
    if (char === "^") {
      const group =
        readGroup(
          expression,
          i + 1
        );

      result +=
        `<sup>${renderExpression(group.value)}</sup>`;

      i =
        group.next;

      continue;
    }

    /*
     * Subscript
     */
    if (char === "_") {
      const group =
        readGroup(
          expression,
          i + 1
        );

      result +=
        `<sub>${renderExpression(group.value)}</sub>`;

      i =
        group.next;

      continue;
    }

    /*
     * Ignore LaTeX grouping braces.
     */
    if (
      char === "{" ||
      char === "}"
    ) {
      i++;
      continue;
    }

    result +=
      escapeHtml(char);

    i++;
  }

  return result;
}

export function restoreMath(
  html,
  mathItems
) {
  let result = html;

  for (const item of mathItems) {
    let rendered;

    try {
      rendered =
        renderExpression(
          item.expression
        );
    } catch {
      rendered =
        escapeHtml(
          item.expression
        );
    }

    const wrapped =
      item.display
        ? `<div class="math-display">${rendered}</div>`
        : `<span class="math-inline">${rendered}</span>`;

    result =
      result.replaceAll(
        item.token,
        wrapped
      );
  }


  return result;
}