const DRONE2_URL = "https://autokgapai-drone.pages.dev/";

export const runtime = "nodejs";

export function GET() {
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rodnam Drone Operations</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #020617; color: white; font-family: "Sarabun", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif; }
    header { max-width: 1280px; margin: 0 auto; padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1, p { margin: 0; }
    h1 { margin-top: 4px; font-size: 28px; line-height: 1.15; }
    p { color: #bae6fd; font-weight: 700; }
    a { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: white; color: #020617; padding: 10px 14px; text-decoration: none; font-weight: 800; }
    main { max-width: 1280px; margin: 0 auto; padding: 0 20px 24px; }
    iframe { width: 100%; height: calc(100vh - 132px); min-height: 680px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: black; }
    @media (max-width: 720px) { header { align-items: flex-start; flex-direction: column; } iframe { min-height: 560px; } }
  </style>
</head>
<body>
  <header>
    <div><p>rodnam drone operations</p><h1>Drone2 Control Room</h1></div>
    <a href="${DRONE2_URL}" target="_blank" rel="noreferrer">Open full drone page</a>
  </header>
  <main><iframe src="${DRONE2_URL}" title="Drone2 control room"></iframe></main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}