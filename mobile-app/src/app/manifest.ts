import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpeakMate 英语口语练习",
    short_name: "SpeakMate",
    description: "录下回答，获得清晰、可执行的英语口语反馈。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ee",
    theme_color: "#173f38",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
