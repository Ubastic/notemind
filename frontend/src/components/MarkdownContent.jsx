import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

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
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
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
