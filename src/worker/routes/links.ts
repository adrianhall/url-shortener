const linkIdPattern = /^[0-9A-Za-z]{8}$/;

type LinkStore = {
  get(key: string): Promise<string | null>;
};

export async function resolveLinkRedirect(links: LinkStore, linkId: string): Promise<Response> {
  if (!linkIdPattern.test(linkId)) return new Response('Link not found', { status: 404 });

  const destination = await links.get(linkId);
  if (destination === null) return new Response('Link not found', { status: 404 });

  return Response.redirect(destination, 302);
}
