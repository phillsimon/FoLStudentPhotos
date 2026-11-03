import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrefsProvider } from "./prefs.jsx";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import StudentPage from "./pages/StudentPage.jsx";
import NotFound from "./pages/NotFound.jsx";
import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Admin from "./pages/Admin.jsx";
import { AuthProvider } from "./auth.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PrefsProvider>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="estudiantes/:slug" element={<StudentPage />} />
            <Route path="entrar" element={<Login />} />
            <Route path="clave" element={<ChangePassword />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </PrefsProvider>
  </React.StrictMode>
);
