const authConfig = {
  providers: [
    {
      // CONVEX_SITE_URL is a Convex built-in env var automatically set to
      // https://exuberant-snake-522.convex.site — it is the OIDC token issuer.
      // auth.config.ts is evaluated at deploy time in the Convex runtime where
      // process.env.CONVEX_SITE_URL IS available.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
