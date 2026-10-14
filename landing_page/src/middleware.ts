import { defineMiddleware } from "astro:middleware";
import { bindOrphans } from "./lib/typography";

// Działa w dev i przy prerenderingu w buildzie, więc obejmuje każdą stronę i każdy tekst,
// także ten wpisany w szablonie, nie tylko w tablicach z treścią.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get("content-type")?.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(bindOrphans(await response.text()), { status: response.status, headers });
});
