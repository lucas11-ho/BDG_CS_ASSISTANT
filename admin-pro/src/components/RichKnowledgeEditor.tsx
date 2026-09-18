import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { Button, ColorPicker, Divider, Dropdown, Input, Modal, Space, Tooltip, message } from "antd";
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ClearOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DeleteColumnOutlined,
  DeleteRowOutlined,
  DragOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ItalicOutlined,
  LinkOutlined,
  MergeCellsOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlusOutlined,
  RedoOutlined,
  RobotOutlined,
  SplitCellsOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useAdminI18n } from "@/i18n/runtime";
import {
  consumeEditorAiStream,
  openEditorAiStream,
  type EditorAiAction,
} from "@/lib/api";
import {
  AiStream,
  MediaEmbed,
  PersistentImage,
  editorDocumentHasTransientState,
  isPermanentMediaUrl,
  resolveMediaEmbed,
  serializePersistentDocument,
} from "@/components/rich-editor/nodes";

type Props = {
  value?: string;
  onChange: (json: string, html: string) => void;
  uploadImage: (file: File) => Promise<string>;
};

type FloatingSelection = { left: number; top: number } | null;
type DragBlock = { pos: number; top: number; height: number; visible: boolean };

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function parseDocument(value?: string) {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "doc" ? parsed : { type: "doc", content: [{ type: "paragraph" }] };
  } catch {
    return value;
  }
}

function imageFiles(list: FileList | File[]) {
  return Array.from(list || []).filter((file) => IMAGE_TYPES.has(file.type));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function createBlurPreview(file: File) {
  const source = await readFileAsDataUrl(file);
  if (file.type === "image/gif") return source;
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const max = 42;
        const ratio = Math.min(1, max / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * ratio));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * ratio));
        const context = canvas.getContext("2d");
        if (!context) return resolve(source);
        context.filter = "blur(2px)";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.42));
      } catch {
        resolve(source);
      }
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}

function findNodeByAttribute(editor: any, nodeName: string, attribute: string, value: string) {
  let found: { pos: number; node: any } | null = null;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!found && node.type.name === nodeName && String(node.attrs?.[attribute] || "") === value) {
      found = { pos, node };
      return false;
    }
    return !found;
  });
  return found;
}

function replaceAiNode(editor: any, requestId: string, text: string) {
  const found = findNodeByAttribute(editor, "aiStream", "requestId", requestId);
  if (!found) return;
  const tr = editor.state.tr;
  if (text) tr.replaceWith(found.pos, found.pos + found.node.nodeSize, editor.state.schema.text(text));
  else tr.delete(found.pos, found.pos + found.node.nodeSize);
  editor.view.dispatch(tr);
}

function updateAiNode(editor: any, requestId: string, text: string) {
  const found = findNodeByAttribute(editor, "aiStream", "requestId", requestId);
  if (!found) return;
  const tr = editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, text });
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

function topLevelElement(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return null;
  const prosemirror = element.closest(".ProseMirror");
  if (!prosemirror) return null;
  let current: HTMLElement | null = element;
  while (current?.parentElement && current.parentElement !== prosemirror) current = current.parentElement;
  return current?.parentElement === prosemirror ? current : null;
}

export default function RichKnowledgeEditor({ value, onChange, uploadImage }: Props) {
  const { t } = useAdminI18n();
  const [fullscreen, setFullscreen] = useState(false);
  const [tableActive, setTableActive] = useState(false);
  const [emptyAiVisible, setEmptyAiVisible] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<FloatingSelection>(null);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingContent, setPendingContent] = useState(false);
  const [dragBlock, setDragBlock] = useState<DragBlock>({ pos: -1, top: 0, height: 0, visible: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const dragSourceRef = useRef<{ pos: number; nodeSize: number } | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const refreshContextUi = (active: any) => {
    const { selection } = active.state;
    setTableActive(active.isActive("table"));
    const emptyParagraph =
      selection.empty &&
      selection.$from.parent.type.name === "paragraph" &&
      selection.$from.parent.content.size === 0;
    setEmptyAiVisible(emptyParagraph);

    if (selection.empty) {
      setSelectionMenu(null);
      return;
    }
    try {
      const start = active.view.coordsAtPos(selection.from);
      const end = active.view.coordsAtPos(selection.to);
      setSelectionMenu({
        left: Math.max(12, (start.left + end.right) / 2),
        top: Math.max(12, Math.min(start.top, end.top) - 10),
      });
    } catch {
      setSelectionMenu(null);
    }
  };

  const queueImageUpload = async (file: File, requestedPos?: number) => {
    const active = editorRef.current;
    if (!active || !IMAGE_TYPES.has(file.type)) return;
    const uploadId = crypto.randomUUID();
    let preview = "";
    try {
      preview = await createBlurPreview(file);
    } catch {
      preview = await readFileAsDataUrl(file);
    }
    const node = {
      type: "image",
      attrs: {
        src: preview,
        alt: file.name,
        title: null,
        uploadId,
        uploadStatus: "uploading",
        originalName: file.name,
      },
    };
    const pos = Number.isInteger(requestedPos) ? Math.max(0, Math.min(Number(requestedPos), active.state.doc.content.size)) : null;
    if (pos !== null) active.chain().focus().insertContentAt(pos, node).run();
    else active.chain().focus().insertContent(node).run();
    setPendingContent(true);

    try {
      const url = await uploadImage(file);
      if (!isPermanentMediaUrl(url)) throw new Error("Upload did not return a permanent HTTPS image URL");
      const current = editorRef.current;
      const found = current ? findNodeByAttribute(current, "image", "uploadId", uploadId) : null;
      if (current && found) {
        const tr = current.state.tr.setNodeMarkup(found.pos, undefined, {
          ...found.node.attrs,
          src: url,
          uploadId: null,
          uploadStatus: "ready",
          originalName: "",
        });
        current.view.dispatch(tr);
      }
      message.success(t("Image uploaded and saved permanently"));
    } catch (error: any) {
      const current = editorRef.current;
      const found = current ? findNodeByAttribute(current, "image", "uploadId", uploadId) : null;
      if (current && found) {
        const tr = current.state.tr.setNodeMarkup(found.pos, undefined, {
          ...found.node.attrs,
          uploadStatus: "error",
        });
        current.view.dispatch(tr);
      }
      message.error(error?.message || t("Image upload failed"));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      PersistentImage.configure({ inline: false, allowBase64: true }),
      MediaEmbed,
      AiStream,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: parseDocument(value),
    onCreate: ({ editor: active }) => {
      editorRef.current = active;
      refreshContextUi(active);
    },
    onSelectionUpdate: ({ editor: active }) => refreshContextUi(active),
    onUpdate: ({ editor: active }) => {
      const raw = active.getJSON();
      const transient = editorDocumentHasTransientState(raw);
      setPendingContent(transient);
      if (transient) return;
      const persistent = serializePersistentDocument(raw);
      onChange(JSON.stringify(persistent), active.getHTML());
    },
    onDestroy: () => {
      editorRef.current = null;
      aiAbortRef.current?.abort();
    },
    editorProps: {
      attributes: {
        class: "bdg-rich-editor-content",
        spellcheck: "true",
        "data-i18n-skip": "true",
      },
      handlePaste(view, event) {
        const files = imageFiles(event.clipboardData?.files || []);
        if (files.length) {
          event.preventDefault();
          const pos = view.state.selection.from;
          void (async () => {
            let insertPos = pos;
            for (const file of files) {
              await queueImageUpload(file, insertPos);
              insertPos = editorRef.current?.state.selection.to ?? insertPos;
            }
          })();
          return true;
        }
        const text = event.clipboardData?.getData("text/plain")?.trim() || "";
        const embed = resolveMediaEmbed(text);
        if (embed) {
          event.preventDefault();
          editorRef.current?.chain().focus().insertContent({
            type: "mediaEmbed",
            attrs: {
              provider: embed.provider,
              sourceUrl: embed.sourceUrl,
              embedUrl: embed.embedUrl,
            },
          }).run();
          return true;
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const start = coords?.pos ?? view.state.selection.from;
        void (async () => {
          let pos = start;
          for (const file of files) {
            await queueImageUpload(file, pos);
            pos = editorRef.current?.state.selection.to ?? pos;
          }
        })();
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== " ") return false;
        const { $from, empty } = view.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph") return false;
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
        if (!textBefore) {
          event.preventDefault();
          setAiPrompt("");
          setAiPromptOpen(true);
          return true;
        }
        if (textBefore === "/ai" || textBefore === "++") {
          event.preventDefault();
          const start = $from.start();
          view.dispatch(view.state.tr.delete(start, $from.pos));
          setAiPrompt("");
          setAiPromptOpen(true);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused || pendingContent) return;
    const incoming = parseDocument(value);
    const incomingJson = typeof incoming === "string" ? incoming : JSON.stringify(incoming);
    if (JSON.stringify(serializePersistentDocument(editor.getJSON())) !== incomingJson) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value, pendingContent]);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  if (!editor) return null;

  const addLink = () => {
    const current = editor.getAttributes("link").href || "https://";
    const href = window.prompt(t("Enter the official link"), current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const runAi = async (action: EditorAiAction, prompt = "") => {
    if (aiBusy) return;
    const active = editorRef.current;
    if (!active) return;
    const selection = active.state.selection;
    const selectedText = selection.empty ? "" : active.state.doc.textBetween(selection.from, selection.to, "\n");
    const originalText = selectedText;
    if (!selectedText && action !== "custom" && action !== "extend") {
      message.info(t("Select text first"));
      return;
    }
    const requestId = crypto.randomUUID();
    const from = selection.from;
    const to = action === "extend" ? selection.to : selection.to;
    const replaceFrom = action === "extend" ? selection.to : selection.from;
    const replaceTo = action === "extend" ? selection.to : selection.to;
    const contextBefore = active.state.doc.textBetween(Math.max(0, from - 600), from, " ").slice(-1800);
    const contextAfter = active.state.doc.textBetween(to, Math.min(active.state.doc.content.size, to + 600), " ").slice(0, 1800);
    const streamNode = {
      type: "aiStream",
      attrs: { requestId, text: "", originalText },
    };

    active.chain().focus().insertContentAt({ from: replaceFrom, to: replaceTo }, streamNode).run();
    setAiBusy(true);
    setAiPromptOpen(false);
    setSelectionMenu(null);
    const controller = new AbortController();
    aiAbortRef.current?.abort();
    aiAbortRef.current = controller;
    let generated = "";

    try {
      const response = await openEditorAiStream({
        action,
        selected_text: selectedText,
        prompt,
        context_before: contextBefore,
        context_after: contextAfter,
        locale: document.documentElement.lang || "en",
      }, controller.signal);
      await consumeEditorAiStream(response, (packet) => {
        if (packet.event === "token") {
          generated += String(packet.data?.text || "");
          const current = editorRef.current;
          if (current) updateAiNode(current, requestId, generated);
        }
        if (packet.event === "error") throw new Error(String(packet.data?.message || "AI writing stream failed"));
      }, controller.signal);
      const current = editorRef.current;
      if (current) replaceAiNode(current, requestId, generated || originalText);
    } catch (error: any) {
      const current = editorRef.current;
      if (current) replaceAiNode(current, requestId, originalText);
      if (error?.name !== "AbortError") message.error(error?.message || t("AI writing failed"));
    } finally {
      setAiBusy(false);
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
    }
  };

  const tool = (title: string, icon: React.ReactNode, action: () => void, active = false, disabled = false) => (
    <Tooltip title={t(title)}>
      <Button size="small" type={active ? "primary" : "default"} icon={icon} onClick={action} disabled={disabled} />
    </Tooltip>
  );

  const insertMenu = {
    items: [
      { key: "image", label: t("Image"), icon: <PictureOutlined /> },
      { key: "table", label: t("Table"), icon: <TableOutlined /> },
      { key: "quote", label: t("Telegram pull quote"), icon: <span>❝</span> },
      { key: "divider", label: t("Divider"), icon: <span>—</span> },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "image") inputRef.current?.click();
      if (key === "table") editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      if (key === "quote") editor.chain().focus().toggleBlockquote().run();
      if (key === "divider") editor.chain().focus().setHorizontalRule().run();
    },
  };

  const aiMenu = {
    items: [
      { key: "fix_grammar", label: t("Fix Grammar") },
      { key: "professional", label: t("Professional tone") },
      { key: "casual", label: t("Casual tone") },
      { key: "summarize", label: t("Summarize Selection") },
      { key: "extend", label: t("Extend Writing") },
      { type: "divider" as const },
      { key: "custom", label: t("Custom AI request") },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "custom") {
        setAiPrompt("");
        setAiPromptOpen(true);
      } else {
        void runAi(key as EditorAiAction);
      }
    },
  };

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dragSourceRef.current) return;
    const block = topLevelElement(event.target);
    const canvas = canvasRef.current;
    if (!block || !canvas) {
      setDragBlock((current) => current.visible ? { ...current, visible: false } : current);
      return;
    }
    try {
      const blockRect = block.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const pos = editor.view.posAtDOM(block, 0);
      setDragBlock({
        pos,
        top: blockRect.top - canvasRect.top + canvas.scrollTop,
        height: blockRect.height,
        visible: true,
      });
    } catch {
      setDragBlock((current) => ({ ...current, visible: false }));
    }
  };

  const onBlockDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    if (dragBlock.pos < 0) return;
    const node = editor.state.doc.nodeAt(dragBlock.pos);
    if (!node) return;
    dragSourceRef.current = { pos: dragBlock.pos, nodeSize: node.nodeSize };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-bdg-editor-block", String(dragBlock.pos));
    event.dataTransfer.setData("text/plain", "");
    setDragBlock((current) => ({ ...current, visible: true }));
  };

  const onCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const source = dragSourceRef.current;
    if (!source || !event.dataTransfer.types.includes("application/x-bdg-editor-block")) return;
    event.preventDefault();
    const targetElement = topLevelElement(event.target);
    const sourceNode = editor.state.doc.nodeAt(source.pos);
    if (!targetElement || !sourceNode) {
      dragSourceRef.current = null;
      return;
    }
    let targetPos = editor.view.posAtDOM(targetElement, 0);
    const targetNode = editor.state.doc.nodeAt(targetPos);
    const rect = targetElement.getBoundingClientRect();
    if (targetNode && event.clientY > rect.top + rect.height / 2) targetPos += targetNode.nodeSize;
    if (targetPos === source.pos || targetPos === source.pos + source.nodeSize) {
      dragSourceRef.current = null;
      return;
    }
    const tr = editor.state.tr.delete(source.pos, source.pos + source.nodeSize);
    const adjusted = targetPos > source.pos ? targetPos - source.nodeSize : targetPos;
    tr.insert(Math.max(0, Math.min(adjusted, tr.doc.content.size)), sourceNode);
    editor.view.dispatch(tr.scrollIntoView());
    dragSourceRef.current = null;
    setDragBlock((current) => ({ ...current, visible: false }));
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
          {tool("Pull quote", <span>❝</span>, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
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
          <Dropdown menu={aiMenu} trigger={["click"]}>
            <Button size="small" icon={<RobotOutlined />} loading={aiBusy}>{t("Ask AI")}</Button>
          </Dropdown>
          <Divider orientation="vertical" />
          {tool("Undo", <UndoOutlined />, () => editor.chain().focus().undo().run())}
          {tool("Redo", <RedoOutlined />, () => editor.chain().focus().redo().run())}
          {tool("Clear formatting", <ClearOutlined />, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
          {tool(fullscreen ? "Exit full screen" : "Full screen", fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />, () => setFullscreen((open) => !open))}
        </Space>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void queueImageUpload(file);
          }}
        />
      </div>

      {pendingContent && (
        <div className="bdg-rich-editor-persistence-status" role="status">
          <span className="bdg-rich-editor-persistence-dot" />
          Temporary content is being processed. Only permanent HTTPS media is saved.
        </div>
      )}

      {tableActive && (
        <div className="bdg-table-grid-controls" contentEditable={false}>
          <Space size={4} wrap>
            <Button size="small" icon={<ColumnHeightOutlined />} onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Button>
            <Button size="small" icon={<DeleteRowOutlined />} onClick={() => editor.chain().focus().deleteRow().run()}>− Row</Button>
            <Button size="small" icon={<ColumnWidthOutlined />} onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</Button>
            <Button size="small" icon={<DeleteColumnOutlined />} onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</Button>
            <Button size="small" icon={<MergeCellsOutlined />} onClick={() => editor.chain().focus().mergeCells().run()}>Merge</Button>
            <Button size="small" icon={<SplitCellsOutlined />} onClick={() => editor.chain().focus().splitCell().run()}>Split</Button>
            <Button size="small" danger onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button>
          </Space>
        </div>
      )}

      <div
        ref={canvasRef}
        className="bdg-rich-editor-canvas"
        onMouseMove={onCanvasMouseMove}
        onMouseLeave={() => !dragSourceRef.current && setDragBlock((current) => ({ ...current, visible: false }))}
        onDragOver={(event) => {
          if (dragSourceRef.current) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={onCanvasDrop}
        onDragEnd={() => {
          dragSourceRef.current = null;
          setDragBlock((current) => ({ ...current, visible: false }));
        }}
      >
        {dragBlock.visible && (
          <button
            type="button"
            className="bdg-block-drag-handle"
            style={{ top: dragBlock.top + Math.max(0, Math.min(12, dragBlock.height / 2 - 12)) }}
            draggable
            onDragStart={onBlockDragStart}
            aria-label={t("Drag block to reorder")}
            title={t("Drag block to reorder")}
          >
            <DragOutlined />
          </button>
        )}
        <EditorContent editor={editor} />

        {emptyAiVisible && !aiBusy && (
          <button
            type="button"
            className="bdg-empty-ai-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setAiPrompt("");
              setAiPromptOpen(true);
            }}
          >
            <RobotOutlined /> {t("Ask AI")} <span>/ai</span>
          </button>
        )}
      </div>

      {selectionMenu && (
        <div className="bdg-selection-ai-menu" style={{ left: selectionMenu.left, top: selectionMenu.top }}>
          <Dropdown menu={aiMenu} trigger={["click"]}>
            <Button size="small" type="primary" icon={<RobotOutlined />} loading={aiBusy}>{t("Ask AI")}</Button>
          </Dropdown>
        </div>
      )}

      <Modal
        title={t("Ask AI")}
        open={aiPromptOpen}
        okText={t("Generate")}
        cancelText={t("Cancel")}
        confirmLoading={aiBusy}
        onCancel={() => setAiPromptOpen(false)}
        onOk={() => {
          const prompt = aiPrompt.trim();
          if (!prompt) {
            message.info(t("Enter an AI writing request"));
            return;
          }
          void runAi("custom", prompt);
        }}
      >
        <Input.TextArea
          autoFocus
          rows={5}
          value={aiPrompt}
          onChange={(event) => setAiPrompt(event.target.value)}
          placeholder={t("Example: Rewrite this as a clear step-by-step customer guide")}
        />
        <div className="bdg-ai-prompt-hint">
          {t("AI edits only the supplied writing context and must not invent platform rules or customer data.")}
        </div>
      </Modal>
    </div>
  );
}
