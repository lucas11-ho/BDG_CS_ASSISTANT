import { Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { LoadingOutlined, WarningOutlined } from "@ant-design/icons";

export type MediaProvider = "youtube" | "x" | "tiktok";

export type MediaEmbedInfo = {
  provider: MediaProvider;
  sourceUrl: string;
  embedUrl: string;
};

export function resolveMediaEmbed(value: string): MediaEmbedInfo | null {
  const raw = String(value || "").trim();
  if (!/^https:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com") {
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0] || "")) id = parts[1] || "";
    }
    if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return {
        provider: "youtube",
        sourceUrl: raw,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      };
    }
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    const match = url.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    if (match?.[1]) {
      return {
        provider: "x",
        sourceUrl: raw,
        embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}`,
      };
    }
  }

  if (host === "tiktok.com" || host === "m.tiktok.com") {
    const match = url.pathname.match(/\/video\/(\d+)/);
    if (match?.[1]) {
      return {
        provider: "tiktok",
        sourceUrl: raw,
        embedUrl: `https://www.tiktok.com/player/v1/${match[1]}`,
      };
    }
  }

  return null;
}

export function isPermanentMediaUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || /^(blob:|data:)/i.test(raw)) return false;
  try {
    const url = new URL(raw, typeof window === "undefined" ? "https://local.invalid" : window.location.origin);
    if (url.protocol === "https:") return true;
    return Boolean((import.meta as any).env?.DEV && url.protocol === "http:");
  } catch {
    return false;
  }
}

function PersistentImageView({ node, selected }: NodeViewProps) {
  const status = String(node.attrs.uploadStatus || "ready");
  const uploading = status === "uploading";
  const failed = status === "error";
  return (
    <NodeViewWrapper
      className={`bdg-editor-image-node${selected ? " is-selected" : ""}${uploading ? " is-uploading" : ""}${failed ? " is-error" : ""}`}
      data-upload-status={status}
    >
      <div className="bdg-editor-image-frame">
        <img src={String(node.attrs.src || "")} alt={String(node.attrs.alt || "")} draggable={false} />
        {uploading && (
          <div className="bdg-editor-image-overlay" contentEditable={false}>
            <LoadingOutlined spin />
            <span>Uploading image…</span>
          </div>
        )}
        {failed && (
          <div className="bdg-editor-image-overlay bdg-editor-image-error" contentEditable={false}>
            <WarningOutlined />
            <span>Upload failed. Delete this image and try again.</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const PersistentImage = Image.extend({
  name: "image",
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null, rendered: false },
      uploadStatus: { default: "ready", rendered: false },
      originalName: { default: "", rendered: false },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(PersistentImageView);
  },
});

function MediaEmbedView({ node, selected }: NodeViewProps) {
  const provider = String(node.attrs.provider || "");
  const sourceUrl = String(node.attrs.sourceUrl || "");
  const embedUrl = String(node.attrs.embedUrl || "");
  const title = provider === "youtube" ? "YouTube video" : provider === "x" ? "X post" : "TikTok video";
  return (
    <NodeViewWrapper className={`bdg-media-embed-node${selected ? " is-selected" : ""}`} data-provider={provider}>
      <div className="bdg-media-embed-frame" contentEditable={false}>
        <iframe
          src={embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a className="bdg-media-embed-source" href={sourceUrl} target="_blank" rel="noreferrer" contentEditable={false}>
        Open original {title}
      </a>
    </NodeViewWrapper>
  );
}

export const MediaEmbed = Node.create({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      provider: { default: "youtube" },
      sourceUrl: { default: "" },
      embedUrl: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-bdg-media-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes.provider || "");
    const sourceUrl = String(HTMLAttributes.sourceUrl || "");
    const embedUrl = String(HTMLAttributes.embedUrl || "");
    const safe = resolveMediaEmbed(sourceUrl);
    const safeEmbed = safe?.provider === provider && safe.embedUrl === embedUrl ? embedUrl : "";
    if (!safeEmbed) {
      return ["p", { class: "bdg-media-embed-fallback" }, ["a", { href: sourceUrl, target: "_blank", rel: "noopener noreferrer" }, sourceUrl]];
    }
    return [
      "div",
      mergeAttributes({ class: "bdg-media-embed", "data-bdg-media-embed": provider }),
      [
        "iframe",
        {
          src: safeEmbed,
          title: provider === "youtube" ? "YouTube video" : provider === "x" ? "X post" : "TikTok video",
          loading: "lazy",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowfullscreen: "true",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedView);
  },
});

function AiStreamView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="bdg-ai-stream-node" contentEditable={false}>
      <span>{String(node.attrs.text || "")}</span>
      <span className="bdg-ai-stream-caret" aria-hidden="true" />
    </NodeViewWrapper>
  );
}

export const AiStream = Node.create({
  name: "aiStream",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      requestId: { default: "", rendered: false },
      text: { default: "", rendered: false },
      originalText: { default: "", rendered: false },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML() {
    return ["span", { class: "bdg-ai-stream-node" }, "AI generation in progress…"];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AiStreamView);
  },
});

export function editorDocumentHasTransientState(doc: any): boolean {
  let transient = false;
  const visit = (node: any) => {
    if (!node || transient) return;
    if (node.type === "aiStream") {
      transient = true;
      return;
    }
    if (node.type === "image") {
      const status = String(node.attrs?.uploadStatus || "ready");
      if (status !== "ready" || !isPermanentMediaUrl(node.attrs?.src)) {
        transient = true;
        return;
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return transient;
}

export function serializePersistentDocument(doc: any): any {
  if (!doc || typeof doc !== "object") return doc;
  if (Array.isArray(doc)) return doc.map(serializePersistentDocument);
  const copy: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === "attrs" && doc.type === "image") {
      const attrs = { ...(value as Record<string, any>) };
      delete attrs.uploadId;
      delete attrs.uploadStatus;
      delete attrs.originalName;
      copy[key] = attrs;
    } else {
      copy[key] = serializePersistentDocument(value);
    }
  }
  return copy;
}
