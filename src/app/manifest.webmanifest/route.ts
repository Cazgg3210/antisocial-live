export function GET() {
  return Response.json(
    {
      id: "/antisocial-live",
      name: "Antisocial Live",
      short_name: "Antisocial",
      description: "Guerra de Bandas — votación en vivo",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#07070a",
      theme_color: "#07070a",
      lang: "es-MX",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } },
  );
}
