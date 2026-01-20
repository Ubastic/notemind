import { Link } from "react-router-dom";

import { useSettings } from "../context/SettingsContext";

const truncate = (text, limit = 160) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const formatTime = (iso) => {
  if (!iso) return "";
  return iso.slice(11, 16);
};

const countUnits = (text) => {
  let units = 0;
  for (const char of text) {
    units += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return units;
};

const buildPreview = (note, mode) => {
  const content = typeof note?.content === "string" ? note.content.trim() : "";
  const summary = typeof note?.ai_summary === "string" ? note.ai_summary.trim() : "";
  if (mode === "timeline") {
    if (content && countUnits(content) <= 300) return content;
    if (summary) return summary;
    if (content) return content;
  }
  return content || summary || note?.short_title || note?.title || "";
};

export default function NoteCard({ note, index = 0, onDelete, previewMode }) {
  const settings = useSettings();
  const categoryLabel =
    settings?.categoryLabels?.[note.ai_category] || note.ai_category || "idea";
  const tags = note.ai_tags || [];
  const title = note.title || note.ai_summary || "Untitled note";
  const preview = buildPreview(note, previewMode);
  const searchInfo = note.search_info;
  const matchType = searchInfo?.match_type || "";
  const matchedKeywords = searchInfo?.matched_keywords || [];
  const similarity =
    typeof searchInfo?.similarity === "number" ? searchInfo.similarity : null;
  const showSimilarity = matchType.includes("semantic") && similarity !== null;
  const matchLabel = matchType.replace("keyword+semantic", "keyword + semantic");
  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;
    await onDelete(note);
  };
  return (
    <div className="note-card" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="note-meta">
        <span className="badge">{categoryLabel}</span>
        <span>{formatTime(note.created_at)}</span>
        {note.ai_sensitivity === "high" ? <span className="badge">Sensitive</span> : null}
      </div>
      {searchInfo ? (
        <div className="search-meta">
          {matchLabel ? <span>Match: {matchLabel}</span> : null}
          {matchedKeywords.length ? (
            <span>Keywords: {matchedKeywords.join(", ")}</span>
          ) : null}
          {showSimilarity ? <span>Similarity: {similarity.toFixed(3)}</span> : null}
        </div>
      ) : null}
      <h3>{title}</h3>
      <p>{truncate(preview)}</p>
      <div className="tag-row">
        {tags.slice(0, 4).map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="note-card-actions">
        <Link className="muted" to={`/note/${note.id}`}>
          Open detail
        </Link>
        {onDelete ? (
          <button className="btn btn-ghost" type="button" onClick={handleDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
