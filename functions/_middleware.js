export async function onRequest(context) {
  const { request, env, next } = context;

  const username = env.SIMEX_BASIC_AUTH_USER;
  const password = env.SIMEX_BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return new Response("Authentication is not configured.", { status: 500 });
  }

  const authorization = request.headers.get("Authorization") || "";
  const [scheme, encoded] = authorization.split(" ");

  if (scheme !== "Basic" || !encoded) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  const providedUsername = decoded.slice(0, separatorIndex);
  const providedPassword = decoded.slice(separatorIndex + 1);

  if (providedUsername === username && providedPassword === password) {
    return next();
  }

  return unauthorized();
}

function unauthorized() {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SimEx Dashboard", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}