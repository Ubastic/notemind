import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import Attachments from "./pages/Attachments";
import Category from "./pages/Category";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NoteDetail from "./pages/NoteDetail";
import Random from "./pages/Random";
import Register from "./pages/Register";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import ShareView from "./pages/ShareView";
import Tags from "./pages/Tags";

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useLanguage();
  if (loading) {
    return <div className="page">{t("common.loading")}</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route path="/share/:token" element={<ShareView />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="note/:id" element={<NoteDetail />} />
        <Route path="category/:type" element={<Category />} />
        <Route path="tags" element={<Tags />} />
        <Route path="attachments" element={<Attachments />} />
        <Route path="search" element={<Search />} />
        <Route path="random" element={<Random />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
