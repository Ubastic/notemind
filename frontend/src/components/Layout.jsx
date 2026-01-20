import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const settings = useSettings();
  const categories = settings?.categories || [];
  const navItems = [
    { to: "/", label: "Timeline" },
    ...categories.map((category) => ({
      to: `/category/${category.key}`,
      label: category.label,
    })),
    { to: "/random", label: "Random" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-title">NoteMind</div>
          <div className="brand-subtitle">Second brain, minimal focus.</div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-bar">
          {user ? <span className="user-chip">@{user.username}</span> : null}
          <button className="btn btn-outline" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
