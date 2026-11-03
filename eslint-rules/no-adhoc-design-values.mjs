// Blocks ad-hoc design values in className/cn()/style so the app can't drift
// off the design tokens (spec §6). Neutral greys are intentionally allowed
// until sub-projects 2–5 give them tokens.
//
// Known gap: only string literals that sit lexically inside a className / cn()
// / clsx() / cva() / twMerge() call (or a style attribute) are inspected.
// Palette strings kept in plain objects or constants and passed to className
// later (e.g. CHIP_TONE_CLASSES, SEVERITY_DOT) are NOT detected. Such tables
// are reviewed by hand and annotated where they keep raw palette on purpose.
const SIZE = /(?<![\w-])(?:[a-z0-9-]+:)*text-\[\d+(?:\.\d+)?(?:px|rem)\]/;
const PALETTE =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|accent|caret|from|via|to)-(?:red|rose|orange|amber|yellow|green|emerald|teal)-\d{2,3}(?![\w-])/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const CLASS_CALLEES = new Set(['cn', 'clsx', 'cva', 'twMerge']);

function inClassContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'JSXAttribute') return p.name?.name === 'className' || p.name?.name === 'class';
    if (p.type === 'CallExpression' && p.callee?.type === 'Identifier') return CLASS_CALLEES.has(p.callee.name);
  }
  return false;
}

function inStyleContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'JSXAttribute') return p.name?.name === 'style';
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Use design tokens instead of ad-hoc sizes, palette colours or hex' },
    messages: {
      size: 'Use a type-scale token (text-caption/label/body/…) instead of "{{v}}".',
      palette: 'Use a semantic colour token (danger/warn/ok/brand) instead of "{{v}}".',
      hex: 'Use COLOR from @/config/design-tokens or a token class instead of "{{v}}".',
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const cls = inClassContext(node);
      const sty = !cls && inStyleContext(node);
      if (!cls && !sty) return;
      if (cls) {
        const s = text.match(SIZE);
        if (s) context.report({ node, messageId: 'size', data: { v: s[0] } });
        const p = text.match(PALETTE);
        if (p) context.report({ node, messageId: 'palette', data: { v: p[0] } });
      }
      const h = text.match(HEX);
      if (h) context.report({ node, messageId: 'hex', data: { v: h[0] } });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default rule;
