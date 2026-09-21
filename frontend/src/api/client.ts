import axios from "axios";

// Default mengikuti deployment modul di belakang portal UVMS. Dengan request
// seperti `/api/dashboard/overview`, Axios menghasilkan
// `/statistik/api/dashboard/overview` yang kemudian di-rewrite oleh Nginx.
const API_BASE_URL = import.meta.env.VITE_API_URL || "/statistik";

// Integrasi login UVMS (README-INTEGRASI-AIS-STATISTIK.md) — cookie sesi UVMS
// hanya terkirim lintas origin kalau withCredentials aktif. Cookie itu baru
// benar-benar bisa dibaca browser setelah frontend & backend dipasang di host
// yang sama (subpath /statistik/), yang SENGAJA belum dikerjakan sesi ini —
// tapi flag ini aman & maju-kompatibel diaktifkan dari sekarang.
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// UVMS belum di-deploy di lingkungan ini -> tidak ada URL login nyata untuk
// di-redirect. Kalau env var ini diisi (setelah integrasi penuh/subpath jalan),
// 401 akan redirect ke portal; kalau kosong, request ditolak seperti biasa dan
// halaman pemanggil menampilkan pesan errornya sendiri (tidak nge-strand user
// ke URL yang belum ada).
const UVMS_LOGIN_URL = import.meta.env.VITE_UVMS_LOGIN_URL as string | undefined;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      console.warn("Sesi UVMS tidak valid/kedaluwarsa (401 login required).");
      if (UVMS_LOGIN_URL) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `${UVMS_LOGIN_URL}?next=${next}`;
      }
    } else if (status === 403) {
      console.warn("Akun tidak punya akses modul statistik (403 module access required).");
    } else if (status === 503) {
      console.error("Layanan otorisasi UVMS tidak tersedia (503).");
    }
    return Promise.reject(error);
  }
);

export default api;
