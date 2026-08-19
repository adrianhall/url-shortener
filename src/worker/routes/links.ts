const linkIdPattern = /^[0-9A-Za-z]{8}$/u;
const notFoundStatus = 404;
const redirectStatus = 302;

interface LinkStore {
  get: (key: string) => Promise<string | null>;
}

export async function resolveLinkRedirect(links: LinkStore, linkId: string): Promise<Response> {
  if (!linkIdPattern.test(linkId)) {
    return new Response('Link not found', { status: notFoundStatus });
  }

  const destination = await links.get(linkId);
  if (destination === null) {
    return new Response('Link not found', { status: notFoundStatus });
  }

  return Response.redirect(destination, redirectStatus);
}
