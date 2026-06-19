import { getSession, signIn, signOut } from "next-auth/react";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sessionMatches(session, email, allowedRoles) {
  if (!session?.user?.id) return false;
  if (session.user.email?.toLowerCase() !== email.toLowerCase()) return false;
  return allowedRoles.includes(session.user.role);
}

let personaChain = Promise.resolve();

async function ensureDemoPersonaImpl(email, { allowedRoles = ["teacher"] } = {}) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) throw new Error("demo email required");

  let session = await getSession();
  if (sessionMatches(session, target, allowedRoles)) return session;

  // Drop a stale persona so the next credentials sign-in gets a fresh JWT.
  if (session?.user?.email && session.user.email.toLowerCase() !== target) {
    await signOut({ redirect: false });
    await sleep(150);
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    session = await getSession();
    if (sessionMatches(session, target, allowedRoles)) return session;

    if (attempt === 0 || (attempt > 0 && attempt % 8 === 0)) {
      const res = await signIn("credentials", { email: target, redirect: false });
      if (res?.error) throw new Error(`sign-in failed: ${res.error}`);
    }
    await sleep(150);
  }

  session = await getSession();
  if (!session?.user?.email) {
    throw new Error("not signed in — refresh the page and try again");
  }
  if (session.user.email.toLowerCase() !== target) {
    throw new Error("institution login required — select Institution in View as and wait for sign-in");
  }
  if (!session.user.id) {
    throw new Error("signed in, but this email is not provisioned in app_users");
  }
  if (!allowedRoles.includes(session.user.role)) {
    throw new Error("institution login required");
  }
  return session;
}

/** Wait for (or trigger) credentials sign-in for a demo persona before API calls. */
export function ensureDemoPersona(email, options = {}) {
  const run = personaChain.then(() => ensureDemoPersonaImpl(email, options));
  personaChain = run.catch(() => {});
  return run;
}

export function isInstitutionSession(session) {
  return !!(
    session?.user?.id &&
    (session.user.role === "teacher" || session.user.role === "admin")
  );
}
