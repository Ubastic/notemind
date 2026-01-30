import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { organizeNotes, applyOrganization } from "../api";
import { useSettings } from "../context/SettingsContext";

export default function AIOrganizeModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const { refreshSettings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("initial"); // initial, processing, preview, applying, success, error
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState("");
  
  // Editing state
  const [editingItem, setEditingItem] = useState(null); // { type: 'category'|'folder', catIndex, folderIndex }
  const [editValue, setEditValue] = useState("");
  const [movingFolder, setMovingFolder] = useState(null); // { catIndex, folderIndex }

  if (!isOpen) return null;

  const handleStart = async () => {
    setLoading(true);
    setStep("processing");
    setError("");
    setEditingItem(null);
    setMovingFolder(null);
    try {
      const result = await organizeNotes();
      setProposal(result);
      setStep("preview");
    } catch (err) {
      console.error(err);
      setError(err.message || t("errors.organizeFailed"));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!proposal) return;
    setLoading(true);
    setStep("applying");
    try {
      await applyOrganization(proposal.categories);
      await refreshSettings();
      setStep("success");
      setTimeout(() => {
        onClose();
        setStep("initial");
        setProposal(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setError(err.message || t("errors.applyFailed"));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (type, catIndex, folderIndex, initialValue) => {
    setEditingItem({ type, catIndex, folderIndex });
    setEditValue(initialValue);
    setMovingFolder(null);
  };

  const saveEdit = () => {
    if (!editingItem || !proposal) return;
    const newProposal = { ...proposal };
    const { type, catIndex, folderIndex } = editingItem;
    
    if (type === "category") {
      newProposal.categories[catIndex].name = editValue;
    } else if (type === "folder") {
      newProposal.categories[catIndex].folders[folderIndex].name = editValue;
    }
    
    setProposal(newProposal);
    setEditingItem(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditValue("");
  };

  const startMoveFolder = (catIndex, folderIndex) => {
    setMovingFolder({ catIndex, folderIndex });
    setEditingItem(null);
  };

  const executeMoveFolder = (targetCatIndex) => {
    if (!movingFolder || !proposal) return;
    if (targetCatIndex === movingFolder.catIndex) {
      setMovingFolder(null);
      return;
    }

    const newProposal = { ...proposal };
    const sourceCat = newProposal.categories[movingFolder.catIndex];
    const targetCat = newProposal.categories[targetCatIndex];
    
    // Remove from source
    const [folder] = sourceCat.folders.splice(movingFolder.folderIndex, 1);
    
    // Add to target
    targetCat.folders.push(folder);
    
    setProposal(newProposal);
    setMovingFolder(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("ai.organizeTitle", "AI Knowledge Organization")}</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          {step === "initial" && (
            <div className="organize-intro">
              <p>{t("ai.organizeIntro", "AI will analyze all your notes and propose a new directory structure based on semantic similarity. This is a heavy operation.")}</p>
              <div className="organize-actions">
                <button className="btn btn-primary" onClick={handleStart}>
                  {t("ai.startOrganize", "Start Organization")}
                </button>
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="organize-loading">
              <div className="spinner"></div>
              <p>{t("ai.processing", "AI is analyzing your notes... This may take a minute.")}</p>
            </div>
          )}

          {step === "preview" && proposal && (
            <div className="organize-preview">
              <h3>{t("ai.proposedStructure", "Proposed Structure")}</h3>
              <p className="hint-text">
                {t("ai.previewHint", "Click names to rename. Use the arrow to move folders.")}
              </p>
              <div className="tree-preview">
                {proposal.categories.map((cat, i) => (
                  <div key={i} className="preview-category">
                    <div className="preview-cat-header">
                      {editingItem?.type === "category" && editingItem.catIndex === i ? (
                        <div className="edit-row">
                          <input 
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          />
                          <button className="icon-btn ok" onClick={saveEdit}>✓</button>
                          <button className="icon-btn cancel" onClick={cancelEdit}>✕</button>
                        </div>
                      ) : (
                        <div 
                          className="preview-cat-name"
                          onClick={() => startEdit("category", i, null, cat.name)}
                          title="Click to rename"
                        >
                          📁 {cat.name} <span className="edit-icon">✎</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="preview-folders">
                      {cat.folders.map((folder, j) => (
                        <div key={j} className="preview-folder">
                          {editingItem?.type === "folder" && editingItem.catIndex === i && editingItem.folderIndex === j ? (
                            <div className="edit-row">
                              <input 
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                              />
                              <button className="icon-btn ok" onClick={saveEdit}>✓</button>
                              <button className="icon-btn cancel" onClick={cancelEdit}>✕</button>
                            </div>
                          ) : (
                            <div className="folder-row">
                              <div 
                                className="folder-name"
                                onClick={() => startEdit("folder", i, j, folder.name)}
                                title="Click to rename"
                              >
                                └─ 📂 {folder.name} <span className="edit-icon">✎</span>
                              </div>
                              <div className="folder-actions">
                                <span className="count">({folder.note_ids.length})</span>
                                {movingFolder?.catIndex === i && movingFolder?.folderIndex === j ? (
                                  <select 
                                    className="move-select"
                                    autoFocus
                                    onChange={(e) => executeMoveFolder(Number(e.target.value))}
                                    onBlur={() => setMovingFolder(null)}
                                    defaultValue=""
                                  >
                                    <option value="" disabled>Move to...</option>
                                    {proposal.categories.map((targetCat, k) => (
                                      <option key={k} value={k} disabled={k === i}>
                                        {targetCat.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <button 
                                    className="icon-btn move" 
                                    onClick={() => startMoveFolder(i, j)}
                                    title="Move folder"
                                  >
                                    ⇄
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {proposal.uncategorized_note_ids?.length > 0 && (
                 <p className="text-warning">
                   {t("ai.uncategorizedCount", { count: proposal.uncategorized_note_ids.length })}
                 </p>
              )}

              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setStep("initial")}>
                  {t("common.back")}
                </button>
                <button className="btn btn-primary" onClick={handleApply}>
                  {t("common.apply")}
                </button>
              </div>
            </div>
          )}

          {step === "applying" && (
            <div className="organize-loading">
              <div className="spinner"></div>
              <p>{t("ai.applying", "Applying changes...")}</p>
            </div>
          )}

          {step === "success" && (
            <div className="organize-success">
              <div className="success-icon">✓</div>
              <p>{t("ai.success", "Organization applied successfully!")}</p>
            </div>
          )}

          {step === "error" && (
            <div className="organize-error">
              <p className="error-text">{error}</p>
              <button className="btn btn-primary" onClick={() => setStep("initial")}>
                {t("common.retry")}
              </button>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: var(--bg-surface, #fff);
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(0,0,0,0.1);
        }
        .modal-header {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-color, #eee);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        .tree-preview {
          background: var(--bg-subtle, #f9f9f9);
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
          max-height: 400px;
          overflow-y: auto;
        }
        .hint-text {
          font-size: 0.9em;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .preview-category {
          margin-bottom: 12px;
        }
        .preview-cat-header {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
        }
        .preview-cat-name {
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .preview-cat-name:hover .edit-icon {
          opacity: 1;
        }
        .preview-folders {
          margin-left: 20px;
          color: var(--text-secondary);
        }
        .preview-folder {
          margin-top: 4px;
          font-size: 0.9em;
        }
        .folder-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .folder-row:hover {
          background: rgba(0,0,0,0.03);
        }
        .folder-name {
          cursor: pointer;
          flex: 1;
        }
        .folder-name:hover .edit-icon {
          opacity: 1;
        }
        .folder-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .edit-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .edit-row input {
          padding: 2px 6px;
          border: 1px solid var(--primary-color);
          border-radius: 4px;
          font-size: inherit;
          width: 200px;
        }
        .edit-icon {
          opacity: 0;
          font-size: 0.9em;
          color: var(--text-secondary);
          transition: opacity 0.2s;
        }
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.1em;
          padding: 2px 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-btn:hover {
          background: rgba(0,0,0,0.05);
        }
        .icon-btn.ok { color: #10b981; }
        .icon-btn.cancel { color: #ef4444; }
        .icon-btn.move { color: var(--text-secondary); font-size: 1.2em; }
        .move-select {
          padding: 2px;
          border-radius: 4px;
          border: 1px solid var(--border-color, #ccc);
          font-size: 0.9em;
          max-width: 150px;
        }
        .count {
          opacity: 0.6;
          font-size: 0.85em;
        }
        .modal-footer {
          margin-top: 24px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .organize-loading, .organize-success, .organize-error {
          text-align: center;
          padding: 40px 0;
        }
        .spinner {
          border: 3px solid rgba(0,0,0,0.1);
          border-radius: 50%;
          border-top: 3px solid var(--accent-color, #000);
          width: 30px;
          height: 30px;
          margin: 0 auto 16px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .btn-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
