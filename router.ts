type Handler = (
  req: Request,
  params: Record<string, unknown>,
  query: URLSearchParams,
) =>
  | Promise<Response | void>
  | Response
  | void;

type Register = (pathname: string, handler: Handler) => void;

interface Route {
  method: string;
  pattern: URLPattern;
  handler: Handler;
  sameOrigin: boolean;
}

export class Router {
  routes: Route[];
  get: Register;
  post: Register;

  constructor() {
    this.routes = [];
    this.get = this.add.bind(this, 'GET');
    this.post = this.add.bind(this, 'POST');
  }

  add(
    method = 'GET',
    pathname = '',
    handler: Handler,
    sameOrigin: boolean = false,
  ): void {
    this.routes.push({
      method,
      pattern: new URLPattern({ pathname }),
      handler,
      sameOrigin,
    });
  }

  async handler(req: Request): Promise<Response> {
    let res: Response | void;
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const host = url.origin;

    for (const route of this.routes) {
      if (route.sameOrigin && origin && origin !== host) {
        return new Response('CORS Error: Same-origin requests only', {
          status: 403,
        });
      }

      if (
        route.method === req.method &&
        (route.pattern.pathname === '*' || route.pattern.test(req.url))
      ) {
        const result = route.pattern.exec(req.url);
        const params = result?.pathname.groups || {};
        const query = url.searchParams;

        res = await route.handler(req, params, query);
        if (res) return res;
      }
    }

    return new Response('404', { status: 404 });
  }
}
