import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Active forbidden() et unauthorized(), qui rendent de vraies pages
     * 403 et 401 avec le bon statut HTTP. Une page maison renverrait 200,
     * ce qui serait faux pour un refus d'accès.
     *
     * API expérimentale, elle peut changer de forme.
     */
    authInterrupts: true,
  },
};

export default nextConfig;
