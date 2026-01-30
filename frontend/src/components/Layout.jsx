import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import LanguageToggle from "./LanguageToggle";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navRef = useRef(null);
  const userMenuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const location = useLocation();
  const settings = useSettings();
  const categories = settings?.categories || [];
  const showCompleted = settings?.showCompleted ?? false;
  const navItems = [
    { to: "/", label: t("nav.timeline") },
    { to: "/tags", label: t("nav.tags") },
    { to: "/attachments", label: t("nav.attachments") },
    { to: "/tracker", label: t("nav.tracker") },
    ...categories.map((category) => ({
      to: `/category/${category.key}`,
      label: category.label,
    })),
    { to: "/random", label: t("nav.random") },
    { to: "/settings", label: t("nav.settings") },
  ];

  useEffect(() => {
    setNavOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const toggleNav = () => {
    setNavOpen((prev) => !prev);
  };

  const closeNav = () => {
    setNavOpen(false);
  };

  const handleOverlayClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeNav();
  };

  const handleOverlayTouchStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeNav();
  };

  const renderNavLinks = () => (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={closeNav}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className={`app ${navOpen ? "nav-open" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-title">NoteMind</div>
          <div className="brand-subtitle">{t("brand.subtitle")}</div>
        </div>
        <nav className="nav-desktop">
          {renderNavLinks()}
        </nav>
        <div className="user-bar">
          <div className="toggle-block">
            <div className="toggle-group" role="group" aria-label={t("nav.completedToggle")}
            >
              <button
                className={`toggle-btn ${showCompleted ? "" : "active"}`}
                type="button"
                onClick={() => settings?.setShowCompleted?.(false)}
              >
                {t("nav.hideCompleted")}
              </button>
              <button
                className={`toggle-btn ${showCompleted ? "active" : ""}`}
                type="button"
                onClick={() => settings?.setShowCompleted?.(true)}
              >
                {t("nav.showCompleted")}
              </button>
            </div>
          </div>
          <LanguageToggle className="language-toggle" />
          {user ? (
            <div className="user-menu-container" ref={userMenuRef}>
              <button 
                className={`user-chip-btn ${userMenuOpen ? "active" : ""}`}
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                @{user.username}
              </button>
              {userMenuOpen && (
                <div className="user-dropdown">
                  <button 
                    className="user-dropdown-item" 
                    type="button" 
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    {t("auth.logout")}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <button
            className="btn btn-ghost menu-toggle"
            type="button"
            onClick={toggleNav}
            aria-expanded={navOpen}
            aria-controls="app-nav"
            ref={menuButtonRef}
          >
            <span className="menu-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="sr-only">{t("nav.menu")}</span>
          </button>
        </div>
      </header>
      
      <nav 
        className={`nav-mobile ${navOpen ? "open" : ""}`} 
        id="app-nav" 
        ref={navRef}
      >
        {renderNavLinks()}
        <div className="nav-actions">
          <LanguageToggle className="language-toggle" />
          <button className="btn btn-outline logout-btn" type="button" onClick={logout}>
            {t("auth.logout")}
          </button>
        </div>
      </nav>

      {navOpen ? (
        <div
          className="nav-overlay"
          role="button"
          tabIndex={-1}
          onClick={handleOverlayClick}
          onTouchStart={handleOverlayTouchStart}
          aria-label={t("nav.close")}
        />
      ) : null}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
