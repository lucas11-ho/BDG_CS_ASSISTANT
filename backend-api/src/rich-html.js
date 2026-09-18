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
    iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy', 'class'],
    div: ['style', 'class', 'data-bdg-media-embed', 'data-bdg-link-card', 'data-provider', 'data-source-url'],
    th: ['colspan', 'rowspan', 'scope', 'style', 'class'],
    td: ['colspan', 'rowspan', 'style', 'class'],
    p: ['style', 'class'],
    span: ['style', 'class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
    iframe: ['https'],
  },
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      'text-align': [/^(left|right|center|justify)$/i],
    },
  },
  disallowedTagsMode: 'discard',
  exclusiveFilter(frame) {
    if (frame.tag === 'img') return !/^https:\/\//i.test(String(frame.attribs?.src || ''));
    if (frame.tag === 'iframe') {
      try {
        const url = new URL(String(frame.attribs?.src || ''));
        const host = url.hostname.toLowerCase();
        const allowed =
          host === 'www.youtube.com'
          || host === 'youtube.com'
          || host === 'www.youtube-nocookie.com'
          || host === 'youtube-nocookie.com'
          || host === 'platform.twitter.com'
          || host === 'www.tiktok.com';
        return url.protocol !== 'https:' || !allowed;
      } catch {
        return true;
      }
    }
    return false;
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

