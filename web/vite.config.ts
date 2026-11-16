import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// The Python server (tools/server.py, port 5410) serves the papers, recordings and the marking API
const api = "http://127.0.0.1:5410";
const hub = "http://127.0.0.1:3121";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5440,
        proxy: {
            // the real homework hub (tools/portal.sh on :3121): sign-in, student and teacher data, media, uploads
            ...Object.fromEntries(["/api/auth", "/api/student", "/api/admin", "/api/settings", "/api/media", "/api/live", "/api/sraith", "/api/mock-oral", "/api/hub", "/uploads/", "/live/"].map((p) => [p, { target: hub, changeOrigin: false }])),
            // the past-questions server: questions, crops, papers, recordings and the marking API
            ...Object.fromEntries(["/api", "/data.json", "/keys.json", "/resources.json", "/papers.json", "/papers/", "/lessons.json", "/grammar.json", "/oral.json", "/oral/sp/", "/crops", "/aud", "/audio", "/subjects.json", "/subjects/"].map((p) => [p, api])),
        },
    },
});
