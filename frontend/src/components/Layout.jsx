import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import LanguageToggle from "./LanguageToggle";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, formatCategoryLabel } = useLanguage();

  // Smart subtitle logic
  const [subtitle, setSubtitle] = useState("");

  useEffect(() => {
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 6) return "夜深了，早点睡美容觉哦🌙";
      if (hour < 9) return "早安小盈盈，记得喝水哦💧";
      if (hour < 12) return "上午好，保持好心情✨";
      if (hour < 14) return "午饭时间到，要吃饱饱🍱";
      if (hour < 18) return "下午好，起来动一动吧🧘‍♀️";
      if (hour < 20) return "傍晚啦，注意休息👀";
      if (hour < 23) return "晚上好，今天过得开心吗🎈";
      return "该睡觉啦，熬夜变熊猫眼哦🐼";
    };

    const tips = [
      "记得多喝水，皮肤才会水嫩嫩！",
      "坐久了要站起来伸个懒腰哦~",
      "眼睛累了吗？看看远处吧。",
      "今天也是元气满满的一天！",
      "保持微笑，好运自然来~",
      "深呼吸，放松一下肩膀。",
      "你是最棒的，加油鸭！",
      "注意坐姿，保护小蛮腰~",
      "不要久坐，起来走两步。",
      "给眼睛放个假，闭目养神一会。"
    ];

    const updateSubtitle = () => {
      const greeting = getGreeting();
      const tipIndex = Math.floor(Math.random() * tips.length);
      setSubtitle(`${greeting} ${tips[tipIndex]}`);
    };

    updateSubtitle();
    const interval = setInterval(updateSubtitle, 60000);
    return () => clearInterval(interval);
  }, []);
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
      label: formatCategoryLabel(category.key, category.label),
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
          <div className="brand-title">小盈盈专属笔记</div>
          <div className="brand-subtitle">{subtitle}</div>
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
