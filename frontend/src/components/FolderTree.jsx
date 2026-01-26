import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";

const truncate = (text, limit) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const getTitle = (note, untitledLabel) => {
  const raw = note?.short_title || note?.title || note?.ai_summary || untitledLabel;
  const trimmed = String(raw || "").trim();
  return trimmed || untitledLabel;
};

const getShortTitle = (note, limit, untitledLabel) =>
  truncate(getTitle(note, untitledLabel), limit);

const formatTime = (iso) => {
  if (!iso) return "";
  return iso.slice(11, 16);
};

const createNode = (id, key, label, parentId = "") => ({
  id,
  key,
  label,
  parentId,
  notes: [],
  children: new Map(),
});

const buildFolderTree = (notes, unclassifiedLabel) => {
  const root = createNode("root", "root", "root");
  const nodeMap = new Map();
  nodeMap.set(root.id, root);

  // Group notes by folder path
  notes.forEach((note) => {
    const folderPath = (note.folder || "").trim();
    
    if (!folderPath) {
      // Handle unclassified notes
      let unclassifiedNode = root.children.get("unclassified");
      if (!unclassifiedNode) {
        unclassifiedNode = createNode(
          "unclassified", 
          "unclassified", 
          unclassifiedLabel, 
          root.id
        );
        root.children.set("unclassified", unclassifiedNode);
        nodeMap.set(unclassifiedNode.id, unclassifiedNode);
      }
      unclassifiedNode.notes.push(note);
      return;
    }

    const parts = folderPath.split("/").filter(p => p.trim());
    let current = root;
    let currentPath = "";

    parts.forEach((part) => {
      const key = part;
      // Use full path as ID to avoid collisions with same-named subfolders
      const nodeId = currentPath ? `${currentPath}/${key}` : key;
      
      let child = current.children.get(key);
      if (!child) {
        child = createNode(nodeId, key, part, current.id);
        current.children.set(key, child);
        nodeMap.set(nodeId, child);
      }
      current = child;
      currentPath = nodeId;
    });

    // Add note to the leaf folder
    current.notes.push(note);
  });

  // Sort children and notes
  const finalize = (node) => {
    // Sort notes by created_at desc
    node.notes.sort((a, b) => ((a?.created_at || "") < (b?.created_at || "") ? 1 : -1));
    
    const children = Array.from(node.children.values());
    children.forEach(finalize);
    
    // Sort children folders alphabetically
    children.sort((a, b) => a.label.localeCompare(b.label));
    node.children = children;
  };

  finalize(root);
  return { root, map: nodeMap };
};

const buildPath = (node, map) => {
  const path = [];
  let current = node;
  while (current && current.id !== "root") {
    path.unshift(current);
    if (!current.parentId) break;
    current = map.get(current.parentId);
  }
  return path;
};

export default function FolderTree({ notes = [] }) {
  const { t } = useLanguage();
  const location = useLocation();
  const untitledLabel = t("common.untitledNote");
  const unclassifiedLabel = t("common.unclassified"); // You might need to add this translation key
  const [isMobile, setIsMobile] = useState(false);
  
  const safeNotes = Array.isArray(notes) ? notes : [];
  const { root, map } = useMemo(
    () => buildFolderTree(safeNotes, unclassifiedLabel),
    [safeNotes, unclassifiedLabel]
  );
  
  const [activeId, setActiveId] = useState("root");

  useEffect(() => {
    const fromState = location.state?.folderActiveId;
    if (fromState && map.has(fromState)) {
      setActiveId(fromState);
      return;
    }
    setActiveId("root");
  }, [safeNotes, location.state?.folderActiveId, map]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateMatch = () => setIsMobile(mediaQuery.matches);
    updateMatch();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateMatch);
    } else {
      mediaQuery.addListener(updateMatch);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", updateMatch);
      } else {
        mediaQuery.removeListener(updateMatch);
      }
    };
  }, []);

  const activeNode = map.get(activeId) || root;
  const path = buildPath(activeNode, map);
  const spineTitleLimit = isMobile ? 18 : 80;

  const renderNotes = (items) => (
    <div className="folder-notes">
      {items.map((note) => (
        <Link
          key={note.id}
          className="note-shelf-item"
          to={`/note/${note.id}`}
          state={{
            from: `${location.pathname}${location.search}`,
            folderActiveId: activeId,
          }}
        >
          <span className="note-shelf-item-title">
            {getShortTitle(note, 44, untitledLabel)}
          </span>
          <span className="note-shelf-item-meta">{formatTime(note.created_at)}</span>
        </Link>
      ))}
    </div>
  );

  const renderNode = (node) => {
    // Show preview of notes in this folder or count of items
    const totalNotes = node.notes.length;
    // Calculate deep count if needed, or just show direct notes
    const directPreview = node.notes.slice(0, 4);
    const extraCount = Math.max(0, node.notes.length - directPreview.length);
    
    return (
      <div key={node.id} className="folder-node">
        <button
          className="folder-head"
          type="button"
          onClick={() => setActiveId(node.id)}
        >
          <div className="folder-title">
            <span className="folder-icon">📁</span> {node.label}
          </div>
          <div className="folder-meta">
            <span className="folder-count">
              {t("common.notesCount", { count: totalNotes })}
            </span>
            <span className="folder-toggle" aria-hidden="true">
              &gt;
            </span>
          </div>
        </button>
        <div className="note-shelf-spines">
          {directPreview.map((note) => (
            <Link
              key={note.id}
              className="note-shelf-spine"
              to={`/note/${note.id}`}
              state={{
                from: `${location.pathname}${location.search}`,
                folderActiveId: activeId,
              }}
            >
              {getShortTitle(note, spineTitleLimit, untitledLabel)}
            </Link>
          ))}
        </div>
        {extraCount > 0 ? (
          <div className="folder-more">{t("common.notesMore", { count: extraCount })}</div>
        ) : null}
      </div>
    );
  };

  if (!safeNotes.length) {
    return <div className="empty-state">{t("common.noNotes")}</div>;
  }

  const showNotes = activeNode.children.length === 0;
  // If we are at root and it only has one child which is unclassified or just one folder, 
  // we might want to behave differently, but for now standard navigation.
  
  // Actually, if a folder has both files and subfolders, we should probably show subfolders first, then files.
  // Or just show files if there are no subfolders.
  // The current logic in TimeFolderTree:
  // const showNotes = activeNode.children.length === 0; 
  // This implies if there are children folders, we DON'T show notes in the current folder list, 
  // but instead show the children folders. 
  // BUT in a file system, a folder can have both.
  
  // Let's modify the view to show both if present.
  const hasChildren = activeNode.children.length > 0;
  const hasNotes = activeNode.notes.length > 0;

  const activeLabel = path.length ? path[path.length - 1].label : t("category.viewFolders");

  return (
    <div className="folder-view">
      {activeNode.id !== "root" ? (
        <div className="folder-nav">
          <button
            className="btn btn-ghost folder-back"
            type="button"
            onClick={() => setActiveId(activeNode.parentId || "root")}
          >
            {t("common.back")}
          </button>
          <div className="folder-current">{activeLabel}</div>
        </div>
      ) : null}

      <div className="folder-tree">
        {hasChildren && (
            activeNode.children.map((node) => renderNode(node))
        )}
      </div>
      
      {hasNotes && (
          <>
            {hasChildren && <div className="folder-divider" />}
            {renderNotes(activeNode.notes)}
          </>
      )}
      
      {!hasChildren && !hasNotes && (
          <div className="empty-state">{t("common.emptyFolder")}</div>
      )}
    </div>
  );
}
