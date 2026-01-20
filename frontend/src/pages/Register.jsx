import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1>Create account</h1>
        <p>Start a private, encrypted notebook.</p>
        <form onSubmit={handleSubmit} className="section">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <div className="error">{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        <div className="divider" />
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
