import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import LanguageToggle from "../components/LanguageToggle";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err.message || t("errors.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-toolbar">
          <LanguageToggle />
        </div>
        <h1>{t("auth.registerTitle")}</h1>
        <p>{t("auth.registerSubtitle")}</p>
        <form onSubmit={handleSubmit} className="section">
          <input
            type="text"
            placeholder={t("auth.username")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder={t("auth.passwordMin")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <div className="error">{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? t("auth.creating") : t("auth.createAccount")}
          </button>
        </form>
        <div className="divider" />
        <p className="muted">
          {t("auth.haveAccount")}
          <Link to="/login">{t("auth.signInLink")}</Link>
          {t("auth.haveAccountSuffix")}
        </p>
      </div>
    </div>
  );
}
