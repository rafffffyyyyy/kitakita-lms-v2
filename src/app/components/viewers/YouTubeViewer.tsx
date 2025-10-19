"use client";
import React from "react";

/** Keep original lightweight regex behavior (no logic change) */
const getYouTubeEmbedUrl = (url: string) => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
};

export default function YouTubeViewer({ url }: { url: string }) {
  const iframeSrc = getYouTubeEmbedUrl(url);
  return (
    <iframe
      title="YouTube preview"
      src={iframeSrc}
      className="w-full h-full"
      allowFullScreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    />
  );
}
