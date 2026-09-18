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
import { Button, ColorPicker, Divider, Dropdown, Space, Tooltip, message } from "antd";
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
  PictureOutlined,
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

function mediaEmbedFromUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com")) {
      const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1];
      if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
      return { provider: "youtube", url: raw.trim(), embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      const id = url.pathname.match(/\/status\/(\d+)/)?.[1];
      if (!id) return null;
      return { provider: "x", url: raw.trim(), embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}` };
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
      if (!id) return null;
      return { provider: "tiktok", url: raw.trim(), embedUrl: `https://www.tiktok.com/player/v1/${id}` };
    }
  } catch {
    return null;
  }
  return null;
}

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
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-bdg-media-embed]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        const iframe = el.querySelector("iframe");
        return {
          provider: el.dataset.bdgMediaEmbed || "",
          url: el.dataset.sourceUrl || "",
          embedUrl: iframe?.getAttribute("src") || "",
        };
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes.provider || "");
    const source = String(HTMLAttributes.url || "");
    const embed = String(HTMLAttributes.embedUrl || "");
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
      if (node?.type === "image") {
        const src = String(node?.attrs?.src || "");
        if (!/^https:\/\//i.test(src)) return null;
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

function documentHasTemporaryMedia(json: any) {
  let temporary = false;
  const walk = (node: any) => {
    if (!node || temporary) return;
    if (node.type === "image") {
      const src = String(node.attrs?.src || "");
      if (node.attrs?.uploadStatus === "uploading" || /^(blob:|data:)/i.test(src)) temporary = true;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(json);
  return temporary;
}

function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not preview image"));
    reader.readAsDataURL(file);
  });
}

function firstTopLevelPos(editor: any, rawPos: number) {
  const bounded = Math.max(0, Math.min(rawPos, editor.state.doc.content.size));
  const resolved = editor.state.doc.resolve(bounded);
  if (resolved.depth === 0) return bounded;
  return resolved.before(1);
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
  const [selectionTick, setSelectionTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);
  const dragPosRef = useRef<number | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const findUploadNode = (uploadId: string) => {
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

  const queueImageUpload = async (file: File, pos?: number) => {
    const active = editorRef.current;
    if (!active || !file.type.startsWith("image/")) return;
    const uploadId = crypto.randomUUID();
    setPendingUploads((count) => count + 1);
    try {
      const preview = await readFileDataUrl(file);
      const attrs = { src: preview, alt: file.name, uploadId, uploadStatus: "uploading" };
      if (typeof pos === "number") active.chain().focus().insertContentAt(pos, { type: "image", attrs }).run();
      else active.chain().focus().setImage(attrs).run();

      const permanentUrl = await uploadImage(file);
      if (!/^https:\/\//i.test(String(permanentUrl || ""))) throw new Error("Media storage did not return a permanent HTTPS URL");
      const match = findUploadNode(uploadId);
      if (!match) return;
      const tr = active.state.tr.setNodeMarkup(match.pos, undefined, {
        ...match.node.attrs,
        src: permanentUrl,
        uploadId: null,
        uploadStatus: "ready",
      });
      active.view.dispatch(tr);
      message.success(t("Image uploaded and inserted"));
    } catch (error: any) {
      const match = findUploadNode(uploadId);
      if (match) editorRef.current?.view.dispatch(editorRef.current.state.tr.delete(match.pos, match.pos + match.node.nodeSize));
      message.error(error?.message || t("Image upload failed"));
    } finally {
      setPendingUploads((count) => Math.max(0, count - 1));
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
    ],
    content: cleanIncomingDocument(value),
    onCreate: ({ editor: active }) => {
      editorRef.current = active;
    },
    onSelectionUpdate: () => setSelectionTick((tick) => tick + 1),
    onUpdate: ({ editor: active }) => {
      editorRef.current = active;
      const json = active.getJSON();
      if (documentHasTemporaryMedia(json)) return;
      onChange(JSON.stringify(json), active.getHTML());

      const { $from } = active.state.selection;
      const text = $from.parent.isTextblock ? $from.parent.textContent.trim() : "";
      if (text === "/ai" || text === "++") {
        const from = $from.start();
        const to = $from.end();
        active.view.dispatch(active.state.tr.delete(from, to));
        setAiReady(true);
      }
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
        const embed = plain && !plain.includes("\n") ? mediaEmbedFromUrl(plain) : null;
        if (embed) {
          event.preventDefault();
          editorRef.current?.chain().focus().insertContent({ type: "mediaEmbed", attrs: embed }).run();
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
        if (empty && $from.parent.isTextblock && $from.parent.content.size === 0) {
          setAiReady(true);
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    if (editor.isFocused || pendingUploads > 0) return;
    const incoming = cleanIncomingDocument(value);
    const incomingJson = typeof incoming === "string" ? incoming : JSON.stringify(incoming);
    if (JSON.stringify(editor.getJSON()) !== incomingJson) editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value, pendingUploads]);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  if (!editor) return null;

  const selection = editor.state.selection;
  const selectedText = selection.empty ? "" : editor.state.doc.textBetween(selection.from, selection.to, "\n").trim();
  const showAiBar = aiReady || !!selectedText || aiBusy;

  const addLink = () => {
    const current = editor.getAttributes("link").href || "https://";
    const href = window.prompt(t("Enter the official link"), current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const addEmbed = () => {
    const raw = window.prompt(t("Paste a YouTube, X, or TikTok URL"), "https://");
    if (!raw) return;
    const embed = mediaEmbedFromUrl(raw);
    if (!embed) return message.error(t("This media URL is not supported"));
    editor.chain().focus().insertContent({ type: "mediaEmbed", attrs: embed }).run();
  };

  const runAI = async (action: EditorAiAction, customPrompt = "") => {
    if (aiBusy) return;
    const activeSelection = editor.state.selection;
    const original = activeSelection.empty ? "" : editor.state.doc.textBetween(activeSelection.from, activeSelection.to, "\n");
    if (!original && !["ask", "extend"].includes(action)) {
      message.info(t("Select text for this AI action"));
      return;
    }
    let prompt = customPrompt;
    if (action === "ask" && !prompt) {
      prompt = window.prompt(t("What should AI write or change?"), "") || "";
      if (!prompt.trim()) return;
    }

    const controller = new AbortController();
    aiAbortRef.current?.abort();
    aiAbortRef.current = controller;
    setAiBusy(true);
    setAiReady(false);
    const from = activeSelection.from;
    let insertPos = from;
    let generated = "";
    try {
      if (!activeSelection.empty) editor.view.dispatch(editor.state.tr.delete(activeSelection.from, activeSelection.to));
      const fullText = editor.getText();
      const context = fullText.slice(Math.max(0, from - 3000), Math.min(fullText.length, from + 3000));
      await streamEditorAI(
        { action, text: original, context, prompt, locale },
        (token) => {
          if (!token || controller.signal.aborted) return;
          const current = editorRef.current;
          if (!current) return;
          current.view.dispatch(current.state.tr.insertText(token, insertPos));
          insertPos += token.length;
          generated += token;
        },
        controller.signal,
      );
      message.success(t("AI writing inserted"));
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        const current = editorRef.current;
        if (current && original) {
          const tr = current.state.tr.delete(from, Math.min(from + generated.length, current.state.doc.content.size)).insertText(original, from);
          current.view.dispatch(tr);
        }
        message.error(error?.message || t("AI writing failed"));
      }
    } finally {
      setAiBusy(false);
      aiAbortRef.current = null;
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
      { key: "embed", label: t("YouTube / X / TikTok") },
      { key: "quote", label: t("Standout quote") },
      { key: "divider", label: t("Divider") },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "image") inputRef.current?.click();
      if (key === "table") editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (key === "embed") addEmbed();
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
    onClick: ({ key }: { key: string }) => void runAI(key as EditorAiAction),
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
          {tool("Link", <LinkOutlined />, addLink, editor.isActive("link"))}
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
              <span>{aiBusy ? t("AI is writing…") : selectedText ? t("AI actions for selection") : t("Ask AI on this line")}</span>
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
    </div>
  );
}
