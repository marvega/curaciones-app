/**
 * @fileoverview Disallows raw HTML controls in src/pages — use primitives from components/ui.
 * @type {import('eslint').Rule.RuleModule}
 */
const FORBIDDEN_TAGS = new Set(['button', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'select', 'textarea']);
const FORBIDDEN_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number']);

const messages = {
  forbiddenTag: "Use the matching primitive from 'components/ui' instead of raw <{{tag}}>.",
  forbiddenInput: "Use <Input> from 'components/ui' instead of <input type=\"{{type}}\">.",
};

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Force usage of design-system primitives in src/pages/**' },
    messages,
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (!filename.includes('/src/pages/')) return {};
    if (filename.includes('/src/pages/dev/')) return {};

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== 'JSXIdentifier') return;
        const tag = name.name;

        if (tag === 'input') {
          const typeAttr = node.attributes.find(
            (a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'type',
          );
          const type = typeAttr && typeAttr.value && typeAttr.value.type === 'Literal'
            ? typeAttr.value.value
            : 'text';
          if (FORBIDDEN_INPUT_TYPES.has(type)) {
            context.report({ node, messageId: 'forbiddenInput', data: { type } });
          }
          return;
        }

        if (FORBIDDEN_TAGS.has(tag)) {
          context.report({ node, messageId: 'forbiddenTag', data: { tag } });
        }
      },
    };
  },
};
