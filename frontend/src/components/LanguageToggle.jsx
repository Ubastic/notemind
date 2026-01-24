import { useLanguage } from "../context/LanguageContext";

export default function LanguageToggle({ className = "" }) {
  const { language, setLanguage, t } = useLanguage();
  const handleSelect = (next) => {
    if (next !== language) {
      setLanguage(next);
    }
  };
  const containerClass = ["toggle-group", className].filter(Boolean).join(" ");

  return (
    <div className={containerClass} role="group" aria-label={t("language.label")}>
      <button
        className={`toggle-btn ${language === "en" ? "active" : ""}`}
        type="button"
        aria-pressed={language === "en"}
        onClick={() => handleSelect("en")}
      >
        {t("language.english")}
      </button>
      <button
        className={`toggle-btn ${language === "zh" ? "active" : ""}`}
        type="button"
        aria-pressed={language === "zh"}
        onClick={() => handleSelect("zh")}
      >
        {t("language.chinese")}
      </button>
    </div>
  );
}
