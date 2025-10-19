"use client";

type Props = {
  file_url: string | null;
  answer_text: string | null;
};

export default function FilePreview({ file_url, answer_text }: Props) {
  if (!file_url && !answer_text) {
    return (
      <div className="text-sm text-neutral-500">No content submitted.</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Answer Text */}
      {answer_text ? (
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs text-neutral-500 mb-1">Answer Text</div>
          <div className="text-sm leading-relaxed text-neutral-900 whitespace-pre-wrap">
            {answer_text}
          </div>
        </section>
      ) : null}

      {/* File Preview */}
      {file_url ? (
        <section className="rounded-xl border border-neutral-200 overflow-hidden">
          {renderPreview(file_url)}
        </section>
      ) : null}
    </div>
  );
}

function renderPreview(url: string) {
  const lower = url.toLowerCase();

  // Images
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) {
    return (
      <img
        src={url}
        alt="Submitted file"
        className="w-full h-auto block"
        loading="lazy"
      />
    );
  }

  // PDF
  if (/\.(pdf)$/.test(lower)) {
    return (
      <iframe
        title="PDF Preview"
        src={url}
        className="w-full h-[50vh] sm:h-[60vh] block"
      />
    );
  }

  // Video (common)
  if (/\.(mp4|webm|ogg)$/.test(lower)) {
    return (
      <video controls className="w-full h-auto block">
        <source src={url} />
        Your browser does not support the video tag.
      </video>
    );
  }

  // Audio (common)
  if (/\.(mp3|wav|m4a|ogg)$/.test(lower)) {
    return (
      <div className="p-3 bg-neutral-50">
        <audio controls className="w-full">
          <source src={url} />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  // Office docs / others → clean fallback
  return (
    <div className="p-3 bg-neutral-50 text-sm text-neutral-700">
      No inline preview available.{" "}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 underline whitespace-nowrap"
      >
        Download file
      </a>
    </div>
  );
}
