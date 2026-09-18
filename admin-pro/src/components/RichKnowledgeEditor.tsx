import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { Button, ColorPicker, Divider, Dropdown, Input, Modal, Space, Tooltip, message } from "antd";
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ClearOutlined,
  DeleteOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PlusOutlined,
  RedoOutlined,
  RobotOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { streamEditorAI, type EditorAiAction } from "@/lib/api";
import { createSmallBlurPreview, isPermanentHttpsUrl, mediaTargetFromUrl, normalizeUserUrl } from "@/lib/rich-editor-utils";
import { useAdminI18n } from "@/i18n/runtime";

type Props = {
  value?: string;
  onChange: (json: string, html: string) => void;
  uploadImage: (file: File) => Promise<string>;
  locale?: string;
};

type HoveredBlock = { pos: number; top: number; height: number } | null;

const AdvancedTableCell = TableCell.extend({
  content: "block+",
});

const PersistentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null, rendered: false },
      uploadStatus: { default: "ready", rendered: false },
    };
  },
  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("span");
      wrapper.className = "bdg-editor-image-node";
      wrapper.contentEditable = "false";
      const img = document.createElement("img");
      const spinner = document.createElement("span");
      spinner.className = "bdg-editor-image-spinner";
      spinner.textContent = "Uploading…";
      wrapper.append(img, spinner);
      const paint = (current: typeof node) => {
        img.src = String(current.attrs.src || "");
        img.alt = String(current.attrs.alt || "");
        const loading = current.attrs.uploadStatus === "uploading";
        wrapper.dataset.uploading = loading ? "true" : "false";
        spinner.hidden = !loading;
      };
      paint(node);
      return {
        dom: wrapper,
        update(next) {
          if (next.type.name !== node.type.name) return false;
          paint(next);
          return true;
        },
      };
    };
  },
});

const AiDraft = Node.create({
  name: "aiDraft",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      draftId: { default: "" },
      text: { default: "" },
      status: { default: "streaming" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-bdg-ai-draft]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        class: "bdg-ai-draft",
        "data-bdg-ai-draft": String(HTMLAttributes.draftId || ""),
        "data-status": String(HTMLAttributes.status || "streaming"),
      },
      String(HTMLAttributes.text || ""),
    ];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "bdg-ai-draft";
      dom.contentEditable = "false";
      const label = document.createElement("div");
      label.className = "bdg-ai-draft-label";
      label.textContent = "AI draft";
      const body = document.createElement("div");
      body.className = "bdg-ai-draft-body";
      const cursor = document.createElement("span");
      cursor.className = "bdg-ai-draft-cursor";
      cursor.textContent = "▋";
      dom.append(label, body, cursor);
      const paint = (current: typeof node) => {
        body.textContent = String(current.attrs.text || "");
        dom.dataset.status = String(current.attrs.status || "streaming");
      };
      paint(node);
      return {
        dom,
        update(next) {
          if (next.type.name !== node.type.name) return false;
          paint(next);
          return true;
        },
      };
    };
  },
});

const MediaEmbed = Node.create({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: "" },
      url: { default: "" },
      embedUrl: { default: "" },
      label: { default: "Open original media" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-bdg-media-embed]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        const iframe = el.querySelector("iframe");
        const anchor = el.querySelector("a");
        return {
          provider: el.dataset.bdgMediaEmbed || "",
          url: el.dataset.sourceUrl || anchor?.getAttribute("href") || "",
          embedUrl: iframe?.getAttribute("src") || "",
          label: anchor?.textContent || "Open original media",
        };
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes.provider || "");
    const source = String(HTMLAttributes.url || "");
    const embed = String(HTMLAttributes.embedUrl || "");
    const label = String(HTMLAttributes.label || "Open original media");
    return [
      "div",
      mergeAttributes({
        class: "bdg-media-embed",
        "data-bdg-media-embed": provider,
        "data-source-url": source,
      }),
      [
        "iframe",
        {
          src: embed,
          title: `${provider || "social"} media embed`,
          loading: "lazy",
          allow: "accelerometer; autoplay; encrypted-media; picture-in-picture; web-share",
          allowfullscreen: "true",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
      [
        "a",
        {
          href: source,
          target: "_blank",
          rel: "noopener noreferrer",
          class: "bdg-media-fallback",
        },
        label,
      ],
    ];
  },
});

const LinkCard = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: "external" },
      url: { default: "" },
      label: { default: "Open link" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-bdg-link-card]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        const anchor = el.querySelector("a");
        return {
          provider: el.dataset.provider || "external",
          url: anchor?.getAttribute("href") || el.dataset.sourceUrl || "",
          label: anchor?.textContent || "Open link",
        };
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes.provider || "external");
    const source = String(HTMLAttributes.url || "");
    const label = String(HTMLAttributes.label || "Open link");
    return [
      "div",
      {
        class: "bdg-link-card",
        "data-bdg-link-card": "true",
        "data-provider": provider,
        "data-source-url": source,
      },
      ["a", { href: source, target: "_blank", rel: "noopener noreferrer" }, label],
    ];
  },
});

function cleanIncomingDocument(value?: string) {
  const fallback = { type: "doc", content: [{ type: "paragraph" }] };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.type !== "doc") return fallback;
    const clean = (node: any): any | null => {
      if (node?.type === "aiDraft") return null;
      if (node?.type === "image") {
        const src = String(node?.attrs?.src || "");
        if (!isPermanentHttpsUrl(src)) return null;
        return { ...node, attrs: { ...node.attrs, uploadId: null, uploadStatus: "ready" } };
      }
      const content = Array.isArray(node?.content) ? node.content.map(clean).filter(Boolean) : undefined;
      return content ? { ...node, content } : node;
    };
    return clean(parsed) || fallback;
  } catch {
    return value;
  }
}

function documentHasTransientNodes(json: any) {
  let transient = false;
  const walk = (node: any) => {
    if (!node || transient) return;
    if (node.type === "aiDraft") transient = true;
    if (node.type === "image") {
      const src = String(node.attrs?.src || "");
      if (node.attrs?.uploadStatus === "uploading" || /^(blob:|data:)/i.test(src)) transient = true;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(json);
  return transient;
}

function firstTopLevelPos(editor: any, rawPos: number) {
  const bounded = Math.max(0, Math.min(rawPos, editor.state.doc.content.size));
  const resolved = editor.state.doc.resolve(bounded);
  if (resolved.depth === 0) return bounded;
  return resolved.before(1);
}

function afterTopLevelBlock(editor: any, rawPos: number) {
  const pos = firstTopLevelPos(editor, rawPos);
  const node = editor.state.doc.nodeAt(pos);
  return node ? Math.min(editor.state.doc.content.size, pos + node.nodeSize) : editor.state.doc.content.size;
}

function blockTargetAtPoint(editor: any, clientX: number, clientY: number) {
  const hit = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!hit) return null;
  const pos = firstTopLevelPos(editor, hit.pos);
  const node = editor.state.doc.nodeAt(pos);
  const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
  if (!node || !dom) return { pos };
  const rect = dom.getBoundingClientRect();
  return { pos: clientY > rect.top + rect.height / 2 ? pos + node.nodeSize : pos };
}

export default function RichKnowledgeEditor({ value, onChange, uploadImage, locale = "en" }: Props) {
  const { t } = useAdminI18n();
  const [fullscreen, setFullscreen] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [hoveredBlock, setHoveredBlock] = useState<HoveredBlock>(null);
  const [aiReady, setAiReady] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [, setSelectionTick] = useState(0);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkText, setLinkText] = useState("");
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaValue, setMediaValue] = useState("");
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPromptValue, setAiPromptValue] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const dragPosRef = useRef<number | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const pendingUploadsRef = useRef(0);
  const aiBusyRef = useRef(false);
  const suppressPersistRef = useRef(false);

  const persistEditor = (active: any) => {
    if (!active || suppressPersistRef.current || pendingUploadsRef.current > 0 || aiBusyRef.current) return;
    const json = active.getJSON();
    if (documentHasTransientNodes(json)) return;
    onChange(JSON.stringify(json), active.getHTML());
  };

  const findUploadNode = (uploadId: string): { pos: number; node: any } | null => {
    const active = editorRef.current;
    if (!active) return null;
    let found: { pos: number; node: any } | null = null;
    active.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === "image" && node.attrs.uploadId === uploadId) {
        found = { pos, node };
        return false;
      }
      return !found;
    });
    return found;
  };

  const findAiDraft = (draftId: string): { pos: number; node: any } | null => {
    const active = editorRef.current;
    if (!active) return null;
    let found: { pos: number; node: any } | null = null;
    active.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === "aiDraft" && node.attrs.draftId === draftId) {
        found = { pos, node };
        return false;
      }
      return !found;
    });
    return found;
  };

  const queueImageUpload = async (file: File, pos?: number) => {
    const active = editorRef.current;
    if (!active || !file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) {
      message.error(t("Image is too large. Maximum size is 20 MB."));
      return;
    }

    const uploadId = crypto.randomUUID();
    pendingUploadsRef.current += 1;
    suppressPersistRef.current = true;
    setPendingUploads(pendingUploadsRef.current);

    try {
      const preview = await createSmallBlurPreview(file);
      const attrs = { src: preview, alt: file.name, uploadId, uploadStatus: "uploading" };
      if (typeof pos === "number") active.chain().focus().insertContentAt(pos, { type: "image", attrs }).run();
      else active.chain().focus().setImage(attrs).run();

      const permanentUrl = await uploadImage(file);
      if (!isPermanentHttpsUrl(permanentUrl)) throw new Error("Media storage did not return a permanent HTTPS URL");

      const match = findUploadNode(uploadId);
      if (!match) throw new Error("The upload placeholder could not be found");
      active.view.dispatch(active.state.tr.setNodeMarkup(match.pos, undefined, {
        ...match.node.attrs,
        src: permanentUrl,
        uploadId: null,
        uploadStatus: "ready",
      }));
      message.success(t("Image uploaded and inserted"));
    } catch (error: any) {
      const match = findUploadNode(uploadId);
      if (match) {
        const current = editorRef.current;
        current?.view.dispatch(current.state.tr.delete(match.pos, match.pos + match.node.nodeSize));
      }
      message.error(error?.message || t("Image upload failed"));
    } finally {
      pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current - 1);
      setPendingUploads(pendingUploadsRef.current);
      if (pendingUploadsRef.current === 0 && !aiBusyRef.current) {
        suppressPersistRef.current = false;
        persistEditor(editorRef.current);
      }
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: { HTMLAttributes: { class: "bdg-telegram-quote" } },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      PersistentImage.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      AdvancedTableCell,
      TableHeader,
      MediaEmbed,
      LinkCard,
      AiDraft,
    ],
    content: cleanIncomingDocument(value),
    onCreate: ({ editor: active }) => {
      editorRef.current = active;
    },
    onSelectionUpdate: () => setSelectionTick((tick) => tick + 1),
    onUpdate: ({ editor: active }) => {
      editorRef.current = active;

      const { $from } = active.state.selection;
      const text = $from.parent.isTextblock ? $from.parent.textContent.trim() : "";
      if ((text === "/ai" || text === "++") && !aiBusyRef.current) {
        const from = $from.start();
        const to = $from.end();
        suppressPersistRef.current = true;
        active.view.dispatch(active.state.tr.delete(from, to));
        suppressPersistRef.current = false;
        setAiReady(true);
        setAiPromptOpen(true);
        return;
      }

      persistEditor(active);
    },
    editorProps: {
      attributes: {
        class: "bdg-rich-editor-content",
        spellcheck: "true",
        "data-i18n-skip": "true",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
        if (files.length) {
          event.preventDefault();
          files.forEach((file) => void queueImageUpload(file));
          return true;
        }

        const plain = event.clipboardData?.getData("text/plain")?.trim() || "";
        const target = plain && !plain.includes("\n") ? mediaTargetFromUrl(plain) : null;
        if (target && target.provider !== "external") {
          event.preventDefault();
          if (target.kind === "embed") {
            editorRef.current?.chain().focus().insertContent({ type:"mediaEmbed", attrs:target }).run();
          } else {
            editorRef.current?.chain().focus().insertContent({ type:"linkCard", attrs:target }).run();
          }
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const start = hit?.pos;
        files.forEach((file, index) => void queueImageUpload(file, typeof start === "number" ? start + index : undefined));
        return true;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== " ") return false;
        const { $from, empty } = view.state.selection;
        if (empty && $from.parent.isTextblock && $from.parent.content.size === 0) setAiReady(true);
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    if (editor.isFocused || pendingUploadsRef.current > 0 || aiBusyRef.current) return;
    const incoming = cleanIncomingDocument(value);
    const incomingJson = typeof incoming === "string" ? incoming : JSON.stringify(incoming);
    if (JSON.stringify(editor.getJSON()) !== incomingJson) editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  if (!editor) return null;

  const selection = editor.state.selection;
  const selectedText = selection.empty ? "" : editor.state.doc.textBetween(selection.from, selection.to, "\n").trim();
  const showAiBar = aiReady || !!selectedText || aiBusy;

  const openLinkModal = () => {
    const current = String(editor.getAttributes("link").href || "");
    setLinkValue(current);
    setLinkText(selection.empty ? "" : selectedText);
    setLinkModalOpen(true);
  };

  const applyLink = () => {
    const href = normalizeUserUrl(linkValue);
    if (!href) {
      message.error(t("Enter a valid web, email, or telephone link"));
      return;
    }
    if (selection.empty) {
      const label = linkText.trim() || href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      editor.chain().focus().insertContent({
        type:"text",
        text:label,
        marks:[{ type:"link", attrs:{ href, target:"_blank", rel:"noopener noreferrer" } }],
      }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href, target:"_blank", rel:"noopener noreferrer" }).run();
    }
    setLinkModalOpen(false);
  };

  const applyMedia = () => {
    const target = mediaTargetFromUrl(mediaValue);
    if (!target) {
      message.error(t("Enter a valid URL. You can paste links with or without https://"));
      return;
    }
    if (target.kind === "embed") editor.chain().focus().insertContent({ type:"mediaEmbed", attrs:target }).run();
    else editor.chain().focus().insertContent({ type:"linkCard", attrs:target }).run();
    setMediaModalOpen(false);
    setMediaValue("");
  };

  const runAI = async (action: EditorAiAction, customPrompt = "") => {
    if (aiBusyRef.current) return;
    const active = editorRef.current;
    if (!active) return;

    const activeSelection = active.state.selection;
    const original = activeSelection.empty ? "" : active.state.doc.textBetween(activeSelection.from, activeSelection.to, "\n");
    if (!original && !["ask", "extend"].includes(action)) {
      message.info(t("Select text for this AI action"));
      return;
    }

    let prompt = customPrompt.trim();
    if (action === "ask" && !prompt) {
      setAiPromptOpen(true);
      return;
    }

    const draftId = crypto.randomUUID();
    let replaceFrom = activeSelection.from;
    let replaceTo = activeSelection.to;
    if (activeSelection.empty && activeSelection.$from.parent.isTextblock && activeSelection.$from.parent.content.size === 0 && activeSelection.$from.depth >= 1) {
      replaceFrom = activeSelection.$from.before(1);
      replaceTo = replaceFrom + activeSelection.$from.parent.nodeSize;
    }

    const previewPos = afterTopLevelBlock(active, activeSelection.to);
    const fullText = active.getText();
    const context = fullText.slice(Math.max(0, activeSelection.from - 3500), Math.min(fullText.length, activeSelection.to + 3500));

    const controller = new AbortController();
    aiAbortRef.current?.abort();
    aiAbortRef.current = controller;
    aiBusyRef.current = true;
    suppressPersistRef.current = true;
    setAiBusy(true);
    setAiReady(false);
    setAiStatus(t("AI is preparing rich content"));

    active.chain().focus().insertContentAt(previewPos, {
      type:"aiDraft",
      attrs:{ draftId, text:"", status:"streaming" },
    }).run();

    let draftText = "";
    let flushTimer: number | null = null;
    const flushDraft = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      const current = editorRef.current;
      const match = findAiDraft(draftId);
      if (!current || !match) return;
      current.view.dispatch(current.state.tr.setNodeMarkup(match.pos, undefined, {
        ...match.node.attrs,
        text:draftText,
        status:"streaming",
      }));
    };
    const queueDraftFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = window.setTimeout(flushDraft, 70);
    };

    try {
      const result = await streamEditorAI(
        { action, text:original, context, prompt, locale },
        (token) => {
          if (!token || controller.signal.aborted) return;
          draftText += token;
          queueDraftFlush();
        },
        controller.signal,
        (status) => setAiStatus(t(status)),
      );

      flushDraft();
      const current = editorRef.current;
      const match = findAiDraft(draftId);
      if (!current || !match) throw new Error("AI preview was interrupted");

      current.view.dispatch(current.state.tr.delete(match.pos, match.pos + match.node.nodeSize));
      aiBusyRef.current = false;
      suppressPersistRef.current = pendingUploadsRef.current > 0;

      const richContent = Array.isArray(result.document?.content) && result.document.content.length
        ? result.document.content
        : [{ type:"paragraph", content:result.text ? [{ type:"text", text:result.text }] : [] }];

      current.chain().focus().insertContentAt({ from:replaceFrom, to:replaceTo }, richContent).run();
      persistEditor(current);
      if (result.degraded) message.warning(t("AI completed with plain-text fallback formatting"));
      else message.success(t("AI rich content inserted"));
    } catch (error: any) {
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      const current = editorRef.current;
      const match = findAiDraft(draftId);
      if (current && match) current.view.dispatch(current.state.tr.delete(match.pos, match.pos + match.node.nodeSize));
      if (error?.name !== "AbortError") message.error(error?.message || t("AI writing failed"));
    } finally {
      aiBusyRef.current = false;
      suppressPersistRef.current = pendingUploadsRef.current > 0;
      setAiBusy(false);
      setAiStatus("");
      aiAbortRef.current = null;
      if (!suppressPersistRef.current) persistEditor(editorRef.current);
    }
  };

  const tool = (title: string, icon: React.ReactNode, action: () => void, active = false, danger = false) => (
    <Tooltip title={t(title)}>
      <Button size="small" danger={danger} type={active ? "primary" : "default"} icon={icon} onClick={action} />
    </Tooltip>
  );

  const insertMenu = {
    items: [
      { key: "image", label: t("Image") },
      { key: "table", label: t("Table") },
      { key: "embed", label: t("Video / social / web link") },
      { key: "quote", label: t("Standout quote") },
      { key: "divider", label: t("Divider") },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "image") inputRef.current?.click();
      if (key === "table") editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (key === "embed") setMediaModalOpen(true);
      if (key === "quote") editor.chain().focus().toggleBlockquote().run();
      if (key === "divider") editor.chain().focus().setHorizontalRule().run();
    },
  };

  const aiMenu = {
    items: [
      { key: "fix_grammar", label: t("Fix Grammar") },
      { key: "professional", label: t("Professional Tone") },
      { key: "casual", label: t("Casual Tone") },
      { key: "summarize", label: t("Summarize Selection") },
      { key: "extend", label: t("Extend Writing") },
      { key: "ask", label: t("Custom AI Prompt…") },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "ask") setAiPromptOpen(true);
      else void runAI(key as EditorAiAction);
    },
  };

  const updateHoveredBlock = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".bdg-rich-editor-toolbar,.bdg-editor-context-bar,.bdg-block-drag-handle")) return;
    const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!hit) return setHoveredBlock(null);
    const pos = firstTopLevelPos(editor, hit.pos);
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const shell = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!dom) return setHoveredBlock(null);
    const rect = dom.getBoundingClientRect();
    setHoveredBlock({ pos, top: rect.top - shell.top, height: rect.height });
  };

  const dropDraggedBlock = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("application/x-bdg-block")) return;
    event.preventDefault();
    const source = dragPosRef.current;
    if (source === null) return;
    const node = editor.state.doc.nodeAt(source);
    const target = blockTargetAtPoint(editor, event.clientX, event.clientY)?.pos;
    if (!node || target === null || target === undefined || target === source || target === source + node.nodeSize) return;
    let insertAt = target;
    const tr = editor.state.tr.delete(source, source + node.nodeSize);
    if (target > source) insertAt -= node.nodeSize;
    insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size));
    tr.insert(insertAt, node);
    editor.view.dispatch(tr.scrollIntoView());
    dragPosRef.current = null;
  };

  return (
    <div className={fullscreen ? "bdg-rich-editor bdg-rich-editor-fullscreen" : "bdg-rich-editor"}>
      <div className="bdg-rich-editor-toolbar">
        <Space size={4} wrap>
          {tool("Bold", <BoldOutlined />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
          {tool("Italic", <ItalicOutlined />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
          {tool("Underline", <UnderlineOutlined />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
          {tool("Strike", <StrikethroughOutlined />, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
          <Divider orientation="vertical" />
          {tool("Heading 1", <span>H1</span>, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
          {tool("Heading 2", <span>H2</span>, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
          {tool("Paragraph", <span>¶</span>, () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph"))}
          {tool("Bullet list", <UnorderedListOutlined />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
          {tool("Numbered list", <OrderedListOutlined />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
          <Divider orientation="vertical" />
          {tool("Align left", <AlignLeftOutlined />, () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }))}
          {tool("Align center", <AlignCenterOutlined />, () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }))}
          {tool("Align right", <AlignRightOutlined />, () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }))}
          <Tooltip title={t("Text color")}>
            <ColorPicker size="small" defaultValue="#17233b" onChangeComplete={(color) => editor.chain().focus().setColor(color.toHexString()).run()} />
          </Tooltip>
          <Tooltip title={t("Highlight")}>
            <ColorPicker size="small" defaultValue="#fff1a8" onChangeComplete={(color) => editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()} />
          </Tooltip>
          {tool("Link", <LinkOutlined />, openLinkModal, editor.isActive("link"))}
          <Dropdown menu={insertMenu} trigger={["click"]}>
            <Button size="small" icon={<PlusOutlined />}>{t("Insert")}</Button>
          </Dropdown>
          <Dropdown menu={aiMenu} trigger={["click"]} disabled={aiBusy}>
            <Button size="small" type={selectedText || aiReady ? "primary" : "default"} loading={aiBusy} icon={<RobotOutlined />}>{t("Ask AI")}</Button>
          </Dropdown>
          <Divider orientation="vertical" />
          {tool("Undo", <UndoOutlined />, () => editor.chain().focus().undo().run())}
          {tool("Redo", <RedoOutlined />, () => editor.chain().focus().redo().run())}
          {tool("Clear formatting", <ClearOutlined />, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
          {tool(fullscreen ? "Exit full screen" : "Full screen", fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />, () => setFullscreen((open) => !open))}
        </Space>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void queueImageUpload(event.target.files[0])} />
      </div>

      {(showAiBar || editor.isActive("table") || pendingUploads > 0) && (
        <div className="bdg-editor-context-bar">
          {pendingUploads > 0 && <span className="bdg-editor-upload-state">{t("Uploading permanent media")} · {pendingUploads}</span>}
          {showAiBar && (
            <Space size={4} wrap>
              <RobotOutlined />
              <span>{aiBusy ? (aiStatus || t("AI is writing and formatting…")) : selectedText ? t("AI actions for selection") : t("Ask AI on this line")}</span>
              {!aiBusy && <Button size="small" onClick={() => void runAI("fix_grammar")}>{t("Fix Grammar")}</Button>}
              {!aiBusy && <Button size="small" onClick={() => void runAI("professional")}>{t("Professional")}</Button>}
              {!aiBusy && <Button size="small" onClick={() => void runAI("summarize")}>{t("Summarize")}</Button>}
              {aiBusy && <Button size="small" danger onClick={() => aiAbortRef.current?.abort()}>{t("Stop")}</Button>}
            </Space>
          )}
          {editor.isActive("table") && (
            <Space size={4} wrap>
              <TableOutlined />
              <span>{t("Table controls")}</span>
              <Button size="small" onClick={() => editor.chain().focus().addRowAfter().run()}>+ {t("Row")}</Button>
              <Button size="small" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ {t("Column")}</Button>
              <Button size="small" onClick={() => editor.chain().focus().deleteRow().run()}>− {t("Row")}</Button>
              <Button size="small" onClick={() => editor.chain().focus().deleteColumn().run()}>− {t("Column")}</Button>
              <Button size="small" onClick={() => editor.chain().focus().mergeCells().run()}>{t("Merge")}</Button>
              <Button size="small" onClick={() => editor.chain().focus().splitCell().run()}>{t("Split")}</Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => editor.chain().focus().deleteTable().run()}>{t("Table")}</Button>
            </Space>
          )}
        </div>
      )}

      <div
        className="bdg-editor-canvas"
        onMouseMove={updateHoveredBlock}
        onMouseLeave={() => setHoveredBlock(null)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/x-bdg-block")) event.preventDefault();
        }}
        onDrop={dropDraggedBlock}
      >
        {hoveredBlock && (
          <button
            type="button"
            draggable
            className="bdg-block-drag-handle"
            style={{ top: hoveredBlock.top + Math.max(0, Math.min(10, hoveredBlock.height / 2 - 12)) }}
            title={t("Drag to reorder block")}
            onMouseDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              dragPosRef.current = hoveredBlock.pos;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-bdg-block", String(hoveredBlock.pos));
            }}
            onDragEnd={() => {
              dragPosRef.current = null;
              setHoveredBlock(null);
            }}
          >
            <span>⋮⋮</span>
          </button>
        )}
        <EditorContent editor={editor} />
      </div>

      <Modal
        title={t("Insert or edit link")}
        open={linkModalOpen}
        onOk={applyLink}
        onCancel={() => setLinkModalOpen(false)}
        okText={t("Apply link")}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width:"100%" }}>
          <Input
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onPressEnter={applyLink}
            placeholder="example.com/page or https://example.com/page"
          />
          {selection.empty && (
            <Input
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              onPressEnter={applyLink}
              placeholder={t("Link text (optional)")}
            />
          )}
        </Space>
      </Modal>

      <Modal
        title={t("Insert video, social post, or web link")}
        open={mediaModalOpen}
        onOk={applyMedia}
        onCancel={() => setMediaModalOpen(false)}
        okText={t("Insert")}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width:"100%" }}>
          <Input
            autoFocus
            value={mediaValue}
            onChange={(event) => setMediaValue(event.target.value)}
            onPressEnter={applyMedia}
            placeholder="youtube.com/..., youtu.be/..., x.com/..., tiktok.com/..., or any web URL"
          />
          <span style={{ color:"#64748b", fontSize:12 }}>
            {t("Supported videos are embedded. Short or non-embeddable links are inserted as a reliable open-link card instead of being rejected.")}
          </span>
        </Space>
      </Modal>

      <Modal
        title={t("Ask AI")}
        open={aiPromptOpen}
        onOk={() => {
          const prompt = aiPromptValue.trim();
          if (!prompt) return message.info(t("Enter an instruction for AI"));
          setAiPromptOpen(false);
          setAiPromptValue("");
          void runAI("ask", prompt);
        }}
        onCancel={() => setAiPromptOpen(false)}
        okText={t("Generate")}
        confirmLoading={aiBusy}
        destroyOnHidden
      >
        <Input.TextArea
          autoFocus
          rows={5}
          value={aiPromptValue}
          onChange={(event) => setAiPromptValue(event.target.value)}
          placeholder={t("Example: Turn this into a 3-column table, make the warning text red, and highlight the deadline in yellow.")}
        />
      </Modal>
    </div>
  );
}
