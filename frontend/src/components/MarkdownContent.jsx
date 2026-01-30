import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import MermaidDiagram from "./MermaidDiagram";

const createTextNode = (value) => ({ type: "text", value });
const createHighlightNode = (value) => ({
  type: "highlight",
  data: { hName: "mark" },
  children: [createTextNode(value)],
});

const ESCAPED_EQ = "__NM_ESCAPED_EQ__";

const restoreEscaped = (value) => value.replaceAll(ESCAPED_EQ, "==");

const splitHighlightText = (value) => {
  if (!value || !value.includes("==")) return null;
  const escapedValue = value.replace(/\\==/g, ESCAPED_EQ);
  if (!escapedValue.includes("==")) {
    return [createTextNode(restoreEscaped(escapedValue))];
  }
  const nodes = [];
  let index = 0;

  while (index < escapedValue.length) {
    const start = escapedValue.indexOf("==", index);
    if (start === -1) {
      nodes.push(createTextNode(restoreEscaped(escapedValue.slice(index))));
      break;
    }
    if (start > index) {
      nodes.push(createTextNode(restoreEscaped(escapedValue.slice(index, start))));
    }
    const end = escapedValue.indexOf("==", start + 2);
    if (end === -1) {
      nodes.push(createTextNode(restoreEscaped(escapedValue.slice(start))));
      break;
    }
    const inner = restoreEscaped(escapedValue.slice(start + 2, end));
    if (!inner || inner.trim() === "" || inner.includes("\n")) {
      nodes.push(createTextNode(restoreEscaped(escapedValue.slice(start, end + 2))));
      index = end + 2;
      continue;
    }
    nodes.push(createHighlightNode(inner));
    index = end + 2;
  }

  return nodes;
};

const remarkHighlight = () => (tree) => {
  const visit = (node) => {
    if (!node || !node.children) return;
    if (node.type === "code" || node.type === "inlineCode") return;
    const nextChildren = [];

    node.children.forEach((child) => {
      if (child.type === "text") {
        const nodes = splitHighlightText(child.value);
        if (nodes) {
          nextChildren.push(...nodes);
        } else {
          nextChildren.push(child);
        }
        return;
      }
      visit(child);
      nextChildren.push(child);
    });

    node.children = nextChildren;
  };

  visit(tree);
};

const appendAttachmentAuth = (url, shareToken) => {
  if (!url || !url.includes("/api/attachments/")) return url;
  if (url.includes("share_token=")) return url;
  const divider = url.includes("?") ? "&" : "?";
  if (shareToken) {
    return `${url}${divider}share_token=${encodeURIComponent(shareToken)}`;
  }
  return url;
};

export default function MarkdownContent({ content, onToggleTask, attachmentToken }) {
  const safeContent = typeof content === "string" ? content : "";
  const allowToggle = typeof onToggleTask === "function";
  let checkboxIndex = 0;

  return (
    <ReactMarkdown
      className="note-content"
      remarkPlugins={[remarkGfm, remarkBreaks, remarkHighlight]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          
          if (!inline && language === "mermaid") {
            return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
          }

          if (!inline) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={language || "text"}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          }
          
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        img: ({ src, alt, ...props }) => (
          <img
            src={appendAttachmentAuth(src, attachmentToken)}
            alt={alt || ""}
            {...props}
          />
        ),
        a: ({ href, ...props }) => (
          <a href={appendAttachmentAuth(href, attachmentToken)} {...props} />
        ),
        input: ({ type, checked, ...props }) => {
          if (type === "checkbox") {
            const index = checkboxIndex;
            checkboxIndex += 1;
            return (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={() => onToggleTask?.(index)}
                readOnly={!allowToggle}
                disabled={!allowToggle}
              />
            );
          }
          return <input type={type} {...props} />;
        },
      }}
    >
      {safeContent}
    </ReactMarkdown>
  );
}
