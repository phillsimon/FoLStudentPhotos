import { currentUser } from "./auth.js";

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(request) {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body;
  } catch {}
  throw new HttpError(400, "bad_request");
}

export const isAdmin = (user) => user?.role === "superadmin";
export const canEditStudent = (user, slug) => !!user && !user.must_change && (isAdmin(user) || user.student_slug === slug);

export async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, "not_signed_in");
  if (user.must_change) throw new HttpError(403, "must_change_password");
  return user;
}

export async function requireAdmin(env, request) {
  const user = await requireUser(env, request);
  if (!isAdmin(user)) throw new HttpError(403, "forbidden");
  return user;
}

