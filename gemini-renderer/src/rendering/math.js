import {
  escapeHtml,
  escapeAttribute,
} from "../utils/escape.js";


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

  cdots: "⋯",
  ldots: "…",
  dots: "…",

  ast: "∗",
  star: "⋆",

  cap: "∩",
  cup: "∪",

  land: "∧",
  lor: "∨",

  neg: "¬",

  angle: "∠",

  degree: "°",
};


function readGroup(
  source,
  start
) {
  if (
    source[start] !== "{"
  ) {
    return {
      value:
        source[start] || "",

      next:
        start + 1,
    };
  }

  let depth = 0;

  for (
    let i = start;
    i < source.length;
    i++
  ) {
    if (
      source[i] === "{"
    ) {
      depth++;

    } else if (
      source[i] === "}"
    ) {
      depth--;

      if (
        depth === 0
      ) {
        return {
          value:
            source.slice(
              start + 1,
              i
            ),

          next:
            i + 1,
        };
      }
    }
  }

  return {
    value:
      source.slice(
        start + 1
      ),

    next:
      source.length,
  };
}


function toUnicodeScript(
  value,
  table
) {
  let result = "";

  for (
    const char of value
  ) {
    result +=
      table[char] || char;
  }

  return result;
}


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

  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
};


function renderPlainText(
  value
) {
  let result = "";
  let i = 0;

  while (
    i < value.length
  ) {
    const char =
      value[i];


    /*
     * Superscript
     */

    if (
      char === "^"
    ) {
      const group =
        readGroup(
          value,
          i + 1
        );

      const rendered =
        renderExpression(
          group.value
        );

      result +=
        `<sup>${rendered}</sup>`;

      i =
        group.next;

      continue;
    }


    /*
     * Subscript
     */

    if (
      char === "_"
    ) {
      const group =
        readGroup(
          value,
          i + 1
        );

      const rendered =
        renderExpression(
          group.value
        );

      result +=
        `<sub>${rendered}</sub>`;

      i =
        group.next;

      continue;
    }


    result +=
      escapeHtml(char);

    i++;
  }

  return result;
}


function renderCommand(
  command,
  source,
  index
) {

  if (
    GREEK[command]
  ) {
    return {
      html:
        GREEK[command],

      next:
        index,
    };
  }


  if (
    SYMBOLS[command]
  ) {
    return {
      html:
        SYMBOLS[command],

      next:
        index,
    };
  }


  /*
   * \frac{a}{b}
   */

  if (
    command === "frac"
  ) {
    const numerator =
      readGroup(
        source,
        index
      );

    const denominator =
      readGroup(
        source,
        numerator.next
      );

    return {
      html:
        `${renderExpression(numerator.value)}` +
        "⁄" +
        `${renderExpression(denominator.value)}`,

      next:
        denominator.next,
    };
  }


  /*
   * \sqrt{x}
   */

  if (
    command === "sqrt"
  ) {
    let next =
      index;

    let rootIndex =
      "";

    if (
      source[next] === "["
    ) {
      const end =
        source.indexOf(
          "]",
          next
        );

      if (
        end !== -1
      ) {
        rootIndex =
          source.slice(
            next + 1,
            end
          );

        next =
          end + 1;
      }
    }

    const group =
      readGroup(
        source,
        next
      );

    const content =
      renderExpression(
        group.value
      );

    if (
      rootIndex
    ) {
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
   * \text{...}
   */

  if (
    command === "text"
  ) {
    const group =
      readGroup(
        source,
        index
      );

    return {
      html:
        escapeHtml(
          group.value
        ),

      next:
        group.next,
    };
  }


  /*
   * \mathrm{}
   * \mathbf{}
   * \mathit{}
   * \operatorname{}
   */

  if (
    command === "mathrm" ||
    command === "mathbf" ||
    command === "mathit" ||
    command === "operatorname"
  ) {
    const group =
      readGroup(
        source,
        index
      );

    return {
      html:
        renderExpression(
          group.value
        ),

      next:
        group.next,
    };
  }


  /*
   * \left / \right
   */

  if (
    command === "left" ||
    command === "right"
  ) {
    return {
      html: "",
      next:
        index,
    };
  }


  /*
   * spacing
   */

  if (
    command === "," ||
    command === ";" ||
    command === ":"
  ) {
    return {
      html: " ",
      next:
        index,
    };
  }

  if (
    command === "!"
  ) {
    return {
      html: "",
      next:
        index,
    };
  }


  if (
    command === "quad" ||
    command === "qquad"
  ) {
    return {
      html: "&nbsp;",
      next:
        index,
    };
  }


  /*
   * Unknown command
   */

  return {
    html:
      `\\${escapeHtml(command)}`,

    next:
      index,
  };
}


function renderExpression(
  expression
) {
  let result = "";
  let i = 0;

  while (
    i < expression.length
  ) {
    const char =
      expression[i];


    /*
     * LaTeX command
     */

    if (
      char === "\\"
    ) {
      let j =
        i + 1;

      while (
        j < expression.length &&
        /[A-Za-z]/.test(
          expression[j]
        )
      ) {
        j++;
      }

      /*
       * Commands مثل:
       * \,
       * \!
       * \{
       * \}
       */

      if (
        j === i + 1
      ) {
        const escaped =
          expression[j];

        if (
          escaped === "{" ||
          escaped === "}" ||
          escaped === "[" ||
          escaped === "]" ||
          escaped === "(" ||
          escaped === ")" ||
          escaped === "|" ||
          escaped === "\\" 
        ) {
          result +=
            escapeHtml(
              escaped
            );

          i += 2;
          continue;
        }

        if (
          escaped === ","
        ) {
          result += " ";
          i += 2;
          continue;
        }

        if (
          escaped === ";" ||
          escaped === ":"
        ) {
          result += " ";
          i += 2;
          continue;
        }

        if (
          escaped === "!"
        ) {
          i += 2;
          continue;
        }
      }


      const command =
        expression.slice(
          i + 1,
          j
        );

      const rendered =
        renderCommand(
          command,
          expression,
          j
        );

      result +=
        rendered.html;

      i =
        rendered.next;

      continue;
    }


    /*
     * Superscript
     */

    if (
      char === "^"
    ) {
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

    if (
      char === "_"
    ) {
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
     * Ignore LaTeX braces
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

  for (
    const item of mathItems
  ) {
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


    /*
     * LaTeX اصلی را نگه می‌داریم
     * تا PDF بتواند آن را دوباره
     * با KaTeX/MathML رندر کند.
     */

    const encodedLatex =
      encodeURIComponent(
        item.expression
      );


    const wrapped =
      item.display

        ? `<div class="math-display" data-latex="${escapeAttribute(encodedLatex)}">${rendered}</div>`

        : `<span class="math-inline" data-latex="${escapeAttribute(encodedLatex)}">${rendered}</span>`;


    result =
      result.replaceAll(
        item.token,
        wrapped
      );
  }

  return result;
}