// Pin data requests to the profile chosen when the request was created, rather
// than the session's mutable default. Ownership is checked for every override.
export function profileScope(get) {
  return async (req, _res, next) => {
    const profileId = req.get('X-Wadi-Profile');
    if (profileId === undefined || /^\/(?:auth|profiles)(?:\/|$)/.test(req.path)) return next();
    if (!profileId || profileId.length > 512 || !await get('SELECT id FROM profiles WHERE id=? AND user_id=?', profileId, req.user.id)) {
      return next(Object.assign(new Error('Profile not found'), { status: 404 }));
    }
    req.user = { ...req.user, profile_id: profileId };
    next();
  };
}
