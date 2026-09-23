export function prepareMarkdown(markdown) {
  const codeBlocks = [];
  const math = [];

  /*
   * =========================================
   * Protect code blocks
   * =========================================
   */

  let protectedMarkdown =
    markdown.replace(
      /```[\s\S]*?```/g,
      (block) => {
        const token =
          `CODEBLOCKTOKEN${codeBlocks.length}X`;

        codeBlocks.push({
          token,
          block,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Display math: $$ ... $$
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\$\$([\s\S]*?)\$\$/g,
      (_, expression) => {
        const token =
          `MATHDISPLAYTOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: true,
        });

        return `\n\n${token}\n\n`;
      }
    );


  /*
   * =========================================
   * Display math: \[ ... \]
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_, expression) => {
        const token =
          `MATHDISPLAYTOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: true,
        });

        return `\n\n${token}\n\n`;
      }
    );


  /*
   * =========================================
   * Inline math: \( ... \)
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_, expression) => {
        const token =
          `MATHINLINETOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: false,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Inline math: $ ... $
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g,
      (_, expression) => {
        const token =
          `MATHINLINETOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: false,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Implicit math:
   *
   * e_1
   * x_2
   * A_1
   * B_12
   *
   * بدون نیاز به $...$
   *
   * این قسمت بعد از محافظت از code blockها
   * اجرا می‌شود.
   * =========================================
   */

 protectedMarkdown =
  protectedMarkdown.replace(
    /(?<![A-Za-z0-9\\])([A-Za-z])(?:_([A-Za-z0-9]+)|\^([A-Za-z0-9]+))(?![A-Za-z0-9])/g,
    (_, base, subscript, superscript) => {
      const token =
        `MATHINLINETOKEN${math.length}X`;

      math.push({
        token,

        expression:
          subscript !== undefined
            ? `${base}_{${subscript}}`
            : `${base}^{${superscript}}`,

        display: false,
      });

      return token;
    }
  );


  /*
   * =========================================
   * حذف componentهای Gemini
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /<ElicitationsGroup\b[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi,
      ""
    );

  protectedMarkdown =
    protectedMarkdown.replace(
      /<Elicitation\b[^>]*\/?>/gi,
      ""
    );


  /*
   * =========================================
   * حذف HTML خام
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /<\/?[a-zA-Z][^>]*>/g,
      ""
    );


  /*
   * =========================================
   * Restore code blocks
   *
   * این کار عمداً بعد از implicit math انجام
   * می‌شود تا e_1 داخل code block تبدیل نشود.
   * =========================================
   */

  for (
    const item of codeBlocks
  ) {
    protectedMarkdown =
      protectedMarkdown.replace(
        item.token,
        item.block
      );
  }

  return {
    markdown:
      protectedMarkdown.trim(),

    math,
  };
}
