import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { Button, ColorPicker, Divider, Space, Tooltip, message } from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  TableOutlined,
  UndoOutlined,
  RedoOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  ClearOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
} from "@ant-design/icons";
import { useAdminI18n } from "@/i18n/runtime";

type Props = {
  value?: string;
  onChange: (json: string, html: string) => void;
  uploadImage: (file: File) => Promise<string>;
};

function parseDocument(value?: string) {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "doc" ? parsed : { type: "doc", content: [{ type: "paragraph" }] };
  } catch {
    return value;
  }
}

export default function RichKnowledgeEditor({ value, onChange, uploadImage }: Props) {
  const { t } = useAdminI18n();
  const [fullscreen, setFullscreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: parseDocument(value),
    onUpdate: ({ editor: active }) => onChange(JSON.stringify(active.getJSON()), active.getHTML()),
    editorProps: {
      attributes: {
        class: "bdg-rich-editor-content",
        spellcheck: "true",
        "data-i18n-skip": "true",
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = parseDocument(value);
    const incomingJson = typeof incoming === "string" ? incoming : JSON.stringify(incoming);
    if (JSON.stringify(editor.getJSON()) !== incomingJson) editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  const addLink = () => {
    const current = editor.getAttributes("link").href || "https://";
    const href = window.prompt(t("Enter the official link"), current);
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  const addImage = async (file?: File) => {
    if (!file) return;
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      message.success(t("Image inserted"));
    } catch (error: any) {
      message.error(error?.message || t("Image upload failed"));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const tool = (title: string, icon: React.ReactNode, action: () => void, active = false) => (
    <Tooltip title={t(title)}>
      <Button size="small" type={active ? "primary" : "default"} icon={icon} onClick={action} />
    </Tooltip>
  );

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
          <Divider orientation="vertical" />
          {tool("Bullet list", <UnorderedListOutlined />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
          {tool("Numbered list", <OrderedListOutlined />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
          {tool("Quote", <span>❝</span>, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
          <Divider orientation="vertical" />
          {tool("Align left", <AlignLeftOutlined />, () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }))}
          {tool("Align center", <AlignCenterOutlined />, () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }))}
          {tool("Align right", <AlignRightOutlined />, () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }))}
          <Divider orientation="vertical" />
          <Tooltip title={t("Text color")}>
            <ColorPicker size="small" defaultValue="#17233b" onChangeComplete={(color) => editor.chain().focus().setColor(color.toHexString()).run()} />
          </Tooltip>
          <Tooltip title={t("Highlight")}>
            <ColorPicker size="small" defaultValue="#fff1a8" onChangeComplete={(color) => editor.chain().focus().toggleHighlight({ color: color.toHexString() }).run()} />
          </Tooltip>
          {tool("Link", <LinkOutlined />, addLink, editor.isActive("link"))}
          {tool("Upload image", <PictureOutlined />, () => inputRef.current?.click())}
          {tool("Insert table", <TableOutlined />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          <Divider orientation="vertical" />
          {tool("Undo", <UndoOutlined />, () => editor.chain().focus().undo().run())}
          {tool("Redo", <RedoOutlined />, () => editor.chain().focus().redo().run())}
          {tool("Clear formatting", <ClearOutlined />, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
          {tool(fullscreen ? "Exit full screen" : "Full screen", fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />, () => setFullscreen((open) => !open))}
        </Space>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => addImage(event.target.files?.[0])} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
