import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
  'a', 'img', 'iframe', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span',
];

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['class'],
    a: ['href', 'target', 'rel', 'title', 'class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'class'],
    iframe: ['src', 'title', 'width', 'height', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy', 'class'],
    th: ['colspan', 'rowspan', 'scope', 'style', 'class'],
    td: ['colspan', 'rowspan', 'style', 'class'],
    p: ['style', 'class'],
    div: ['style', 'class'],
    span: ['style', 'class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
  allowProtocolRelative: false,
  allowedIframeHostnames: ['www.youtube-nocookie.com', 'platform.twitter.com', 'www.tiktok.com'],
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      'text-align': [/^(left|right|center|justify)$/i],
    },
  },
  disallowedTagsMode: 'discard',
  exclusiveFilter(frame) {
    return frame.tag === 'img' && !/^https:\/\//i.test(String(frame.attribs?.src || ''));
  },
  transformTags: {
    a(tagName, attribs) {
      const target = attribs.target === '_blank' ? '_blank' : undefined;
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(target ? { target, rel: 'noopener noreferrer' } : { target: undefined, rel: undefined }),
        },
      };
    },
    img(tagName, attribs) {
      return {
        tagName,
        attribs: {
          ...attribs,
          loading: 'lazy',
        },
      };
    },
  },
};

export function sanitizeRichHtml(value, maxLength = 200_000) {
  const input = String(value || '').slice(0, maxLength);
  return sanitizeHtml(input, SANITIZE_OPTIONS);
}

