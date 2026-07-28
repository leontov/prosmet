const favicon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#202124"/>
  <path d="M18 17h19c7.2 0 12 4.2 12 10.4 0 5-3.3 8.4-8.3 9.7L49 48H38.4l-7.1-9.8H28V48H18V17Zm10 8v6h8.2c2.1 0 3.5-1.1 3.5-3s-1.4-3-3.5-3H28Z" fill="#fff"/>
</svg>
`.trim();

export const dynamic = "force-static";

export function GET() {
  return new Response(favicon, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable"
    }
  });
}
