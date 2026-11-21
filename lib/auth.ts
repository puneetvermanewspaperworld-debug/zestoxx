/**
 * Who is making a request. There is no sign-up yet, so a visitor is a guest: see lib/guest.ts, whose `withGuest` is the one way a route
 * gets a user. The shared "demo" user the app once used for everybody is never served any more.
 */
export { withGuest, resolveGuest, DEMO_USER_EMAIL } from "@/lib/guest";
