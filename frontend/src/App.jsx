import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import Category from "./pages/Category";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NoteDetail from "./pages/NoteDetail";
import Random from "./pages/Random";
import Register from "./pages/Register";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import ShareView from "./pages/ShareView";

function RequireAuth({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return <div className="page">Loading...</div>;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { token } = useAuth();
  if (token) {
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
        <Route path="search" element={<Search />} />
        <Route path="random" element={<Random />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
