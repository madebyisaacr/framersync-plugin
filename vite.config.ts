import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import mkcert from "vite-plugin-mkcert";
import framer from "vite-plugin-framer";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), mkcert(), framer()],
	css: {
		postcss: path.resolve(__dirname, "../../postcss.config.js"),
	},
	resolve: {
		alias: {
			"@shared": path.resolve(__dirname, "../../shared"),
			"@plugin": path.resolve(__dirname),
		},
	},
});
