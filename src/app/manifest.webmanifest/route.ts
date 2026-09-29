export function GET() {
  return Response.json(
    {
      name: "Antisocial Live",
      short_name: "Antisocial",
      start_url: "/",
      display: "standalone",
      background_color: "#07070a",
      theme_color: "#07070a",
      lang: "es-MX",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
